import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { articles } from "../db/schema";
import { config } from "../lib/config";
import { db } from "../lib/db";

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
