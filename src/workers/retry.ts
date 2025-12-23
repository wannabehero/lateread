import { config } from "../lib/config";
import { spawnArticleWorker } from "../lib/worker";
import {
  getExhaustedArticles,
  getStuckArticles,
  markArticleAsError,
} from "../services/retry.service";

/**
 * Retry failed articles that are stuck in pending, processing, or failed states
 * Called by cron every 5 minutes
 */
export async function retryFailedArticles(): Promise<void> {
  console.log("[Retry Worker] Starting retry job...");

  try {
    // 1. Get stuck articles that need retry
    const stuckArticles = await getStuckArticles();

    console.log(
      `[Retry Worker] Found ${stuckArticles.length} articles to retry`,
    );

    // 2. Spawn workers for each stuck article
    for (const article of stuckArticles) {
      console.log(
        `[Retry Worker] Retrying article ${article.id} (attempt ${article.processingAttempts + 1}/${config.MAX_RETRY_ATTEMPTS})`,
      );

      // Spawn worker without callbacks (fire and forget)
      spawnArticleWorker({
        articleId: article.id,
      });
    }

    // 3. Get articles that have exhausted retry attempts
    const exhaustedArticles = await getExhaustedArticles();

    console.log(
      `[Retry Worker] Found ${exhaustedArticles.length} articles that exhausted retries`,
    );

    // 4. Mark exhausted articles as error
    for (const article of exhaustedArticles) {
      await markArticleAsError(article.id, "Max retry attempts exceeded");

      console.log(
        `[Retry Worker] Marked article ${article.id} as error (${article.processingAttempts} attempts)`,
      );
    }

    console.log(
      `[Retry Worker] Retry job complete: ${stuckArticles.length} retried, ${exhaustedArticles.length} marked as error`,
    );
  } catch (error) {
    console.error("[Retry Worker] Error during retry job:", error);
  }
}
