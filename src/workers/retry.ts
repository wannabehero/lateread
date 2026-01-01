import { config } from "../lib/config";
import { defaultLogger } from "../lib/logger";
import { spawnArticleWorker } from "../lib/worker";
import {
  getExhaustedArticles,
  getStuckArticles,
  markArticleAsError,
} from "../services/retry.service";

const logger = defaultLogger.child({ module: "retry" });

/**
 * Retry failed articles that are stuck in pending, processing, or failed states
 * Called by cron every 5 minutes
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
