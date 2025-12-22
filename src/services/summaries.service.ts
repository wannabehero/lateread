import { eq } from "drizzle-orm";
import { articleSummaries } from "../db/schema";
import { db } from "../lib/db";
import type { SummaryResult } from "../lib/llm";
import { getLLMProvider } from "../lib/llm";
import { getArticleContent } from "./content.service";

/**
 * Get or generate summary for an article
 * Returns cached summary if exists, otherwise generates new one
 */
export async function getOrGenerateSummary(
  userId: string,
  articleId: string,
  articleUrl: string,
): Promise<SummaryResult> {
  // Check if summary already exists
  const [existingSummary] = await db
    .select()
    .from(articleSummaries)
    .where(eq(articleSummaries.articleId, articleId))
    .limit(1);

  if (existingSummary) {
    return {
      oneSentence: existingSummary.oneSentence,
      oneParagraph: existingSummary.oneParagraph,
      long: existingSummary.long,
    };
  }

  // Generate new summary
  const content = await getArticleContent(userId, articleId, articleUrl);

  // Extract plain text from HTML for better summarization
  const textContent = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

  const llmProvider = getLLMProvider();
  const summary = await llmProvider.summarize(textContent);

  // Cache the summary
  await db.insert(articleSummaries).values({
    articleId,
    oneSentence: summary.oneSentence,
    oneParagraph: summary.oneParagraph,
    long: summary.long,
  });

  return summary;
}
