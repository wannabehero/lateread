import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { articles } from "../db/schema";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { defaultLogger } from "../lib/logger";
import { spawnArticleWorker } from "../lib/worker";

const logger = defaultLogger.child({ module: "retry" });

export interface StuckArticle {
  id: string;
  url: string;
  status: "pending" | "processing" | "failed";
  processingAttempts: number;
  updatedAt: Date;
}

export interface ExhaustedArticle {
  id: string;
  url: string;
  processingAttempts: number;
}

/**
 * Get articles that are stuck in processing and need retry
 * Returns articles in pending/processing/failed state that:
 * - Haven't been updated for RETRY_DELAY_MINUTES
 * - Haven't exceeded MAX_RETRY_ATTEMPTS
 */
export async function getStuckArticles(): Promise<StuckArticle[]> {
  const delayMs = config.RETRY_DELAY_MINUTES * 60 * 1000;
  const cutoffTime = new Date(Date.now() - delayMs);

  const results = await db
    .select({
      id: articles.id,
      url: articles.url,
      status: articles.status,
      processingAttempts: articles.processingAttempts,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(
      and(
        // Status is pending, processing, or failed
        or(
          eq(articles.status, "pending"),
          eq(articles.status, "processing"),
          eq(articles.status, "failed"),
        ),
        // Updated more than RETRY_DELAY_MINUTES ago
        lt(articles.updatedAt, cutoffTime),
        // Not yet exhausted retry attempts
        lt(articles.processingAttempts, config.MAX_RETRY_ATTEMPTS),
      ),
    );

  // Type assertion safe because WHERE clause filters to these statuses
  return results as StuckArticle[];
}

/**
 * Get articles that have exhausted all retry attempts
 * Returns articles that:
 * - Are not in completed or error state
 * - Have reached or exceeded MAX_RETRY_ATTEMPTS
 */
export async function getExhaustedArticles(): Promise<ExhaustedArticle[]> {
  return db
    .select({
      id: articles.id,
      url: articles.url,
      processingAttempts: articles.processingAttempts,
    })
    .from(articles)
    .where(
      and(
        // Not yet marked as error or completed
        ne(articles.status, "error"),
        ne(articles.status, "completed"),
        // Exhausted retry attempts
        sql`${articles.processingAttempts} >= ${config.MAX_RETRY_ATTEMPTS}`,
      ),
    );
}

/**
 * Mark an article as error with a message
 * Used when articles have exhausted all retry attempts
 */
export async function markArticleAsError(
  articleId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .update(articles)
    .set({
      status: "error",
      lastError: errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId));
}

/**
 * Retry failed articles that are stuck in pending, processing, or failed states
 */
export async function retryFailedArticles(): Promise<void> {
  logger.info("Starting retry job...");

  try {
    // 1. Get stuck articles that need retry
    const stuckArticles = await getStuckArticles();

    logger.info("Found articles to retry", {
      count: stuckArticles.length,
    });

    // 2. Spawn workers for each stuck article
    for (const article of stuckArticles) {
      logger.info("Retrying article", {
        article: article.id,
        attempt: article.processingAttempts + 1,
        maxAttempts: config.MAX_RETRY_ATTEMPTS,
      });

      // Spawn worker without callbacks (fire and forget)
      spawnArticleWorker({
        articleId: article.id,
      });
    }

    // 3. Get articles that have exhausted retry attempts
    const exhaustedArticles = await getExhaustedArticles();

    logger.info("Found articles that exhausted retries", {
      count: exhaustedArticles.length,
    });

    // 4. Mark exhausted articles as error
    for (const article of exhaustedArticles) {
      await markArticleAsError(article.id, "Max retry attempts exceeded");

      logger.info("Marked article as error", {
        article: article.id,
        attempts: article.processingAttempts,
        maxAttempts: config.MAX_RETRY_ATTEMPTS,
      });
    }

    logger.info("Retry job complete", {
      stuckArticles: stuckArticles.length,
      exhaustedArticles: exhaustedArticles.length,
    });
  } catch (error) {
    logger.error("Error during retry job", { error });
  }
}
