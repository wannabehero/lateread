import path from "node:path";
import bunline, { type Queue } from "bunline";
import { bot } from "../bot";
import { markArticleAsError } from "../services/retry.service";
import { config } from "./config";
import { defaultLogger } from "./logger";

const logger = defaultLogger.child({ module: "queue" });

/**
 * Telegram message context for reaction feedback
 */
export interface TelegramContext {
  chatId: number;
  messageId: number;
}

/**
 * Job data for article processing
 */
export interface ArticleJobData {
  articleId: string;
  telegram?: TelegramContext;
}

// Queue instance (singleton)
let articleQueue: Queue<ArticleJobData> | null = null;

/**
 * Get the database path for the queue
 * Places queue.db in the same directory as the main database
 */
function getQueueDbPath(): string {
  const dbDir = path.dirname(config.DATABASE_URL);
  return path.join(dbDir, "queue.db");
}

/**
 * Get or create the article processing queue
 */
export function getArticleQueue(): Queue<ArticleJobData> {
  if (!articleQueue) {
    throw new Error("Article queue not initialized. Call initQueue() first.");
  }
  return articleQueue;
}

/**
 * Initialize the article processing queue and start processing
 */
export function initQueue(): void {
  if (articleQueue) {
    logger.warn("Queue already initialized");
    return;
  }

  const dbPath = getQueueDbPath();
  logger.info("Initializing article queue", { dbPath });

  articleQueue = bunline.createQueue<ArticleJobData>("article-processing", {
    dbPath,
    maxConcurrency: 2,
    pollInterval: 500,
    lockDuration: config.PROCESSING_TIMEOUT_SECONDS * 1000 + 5000, // Processing timeout + buffer
  });

  // Subscribe to job completion events for message feedback
  articleQueue.on("job:completed", async (job) => {
    const { telegram, articleId } = job.data;
    if (telegram) {
      try {
        await bot.api.setMessageReaction(telegram.chatId, telegram.messageId, [
          { type: "emoji", emoji: "👍" },
        ]);
        logger.info("Updated reaction to success", { articleId });
      } catch (error) {
        logger.warn("Failed to update reaction", { articleId, error });
      }
    }
  });

  articleQueue.on("job:exhausted", async (job, error) => {
    const { telegram, articleId } = job.data;

    // Mark article as permanently failed
    await markArticleAsError(
      articleId,
      String(error) || "Max retry attempts exceeded",
    );

    if (telegram) {
      try {
        await bot.api.setMessageReaction(telegram.chatId, telegram.messageId, [
          { type: "emoji", emoji: "👎" },
        ]);
        logger.info("Updated reaction to failure", { articleId });
      } catch (reactionError) {
        logger.warn("Failed to update reaction", {
          articleId,
          error: reactionError,
        });
      }
    }
    logger.error("Article processing exhausted all retries", {
      articleId,
      error: String(error),
    });
  });

  // Start processing with worker thread
  const workerPath = new URL("../workers/article-worker.ts", import.meta.url)
    .pathname;
  logger.info("Starting queue processor", { workerPath });
  articleQueue.process(workerPath);
}

/**
 * Add an article to the processing queue
 */
export function addArticleJob(
  articleId: string,
  telegram?: TelegramContext,
): void {
  const queue = getArticleQueue();
  queue.add(
    { articleId, telegram },
    {
      maxRetries: config.MAX_RETRY_ATTEMPTS,
      backoffType: "exponential",
      backoffDelay: config.RETRY_DELAY_MINUTES * 60 * 1000,
    },
  );
  logger.info("Added article to queue", { articleId, hasTelegram: !!telegram });
}

/**
 * Stop the queue gracefully
 */
export async function stopQueue(): Promise<void> {
  if (!articleQueue) {
    return;
  }

  logger.info("Stopping article queue...");
  await articleQueue.stop({ graceful: true, timeout: 30000 });
  articleQueue = null;
  logger.info("Article queue stopped");
}
