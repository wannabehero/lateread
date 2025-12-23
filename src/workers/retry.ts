import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { articles } from "../db/schema";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { spawnArticleWorker } from "../lib/worker";

/**
 * Retry failed articles that are stuck in pending, processing, or failed states
 * Called by cron every 5 minutes
 */
export async function retryFailedArticles(): Promise<void> {
  const delayMs = config.RETRY_DELAY_MINUTES * 60 * 1000;
  const cutoffTime = new Date(Date.now() - delayMs);

  console.log("[Retry Worker] Starting retry job...");

  try {
    // 1. Query stuck articles that need retry
    const stuckArticles = await db
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

    console.log(
      `[Retry Worker] Found ${stuckArticles.length} articles to retry`,
    );

    // 2. Spawn workers for each stuck article
    for (const article of stuckArticles) {
      console.log(
        `[Retry Worker] Retrying article ${article.id} (attempt ${article.processingAttempts + 1}/${config.MAX_RETRY_ATTEMPTS})`,
      );

      // Spawn worker without telegram context (no reactions)
      spawnArticleWorker({
        articleId: article.id,
        telegramChatId: null,
        telegramMessageId: null,
      });
    }

    // 3. Query articles that have exhausted retry attempts
    const exhaustedArticles = await db
      .select({
        id: articles.id,
        url: articles.url,
        processingAttempts: articles.processingAttempts,
      })
      .from(articles)
      .where(
        and(
          // Not yet marked as error
          ne(articles.status, "error"),
          ne(articles.status, "completed"),
          // Exhausted retry attempts
          sql`${articles.processingAttempts} >= ${config.MAX_RETRY_ATTEMPTS}`,
        ),
      );

    console.log(
      `[Retry Worker] Found ${exhaustedArticles.length} articles that exhausted retries`,
    );

    // 4. Mark exhausted articles as error
    for (const article of exhaustedArticles) {
      await db
        .update(articles)
        .set({
          status: "error",
          lastError: "Max retry attempts exceeded",
          updatedAt: new Date(),
        })
        .where(eq(articles.id, article.id));

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
