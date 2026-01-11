import { eq } from "drizzle-orm";
import { articles } from "../db/schema";
import { db } from "../lib/db";

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
