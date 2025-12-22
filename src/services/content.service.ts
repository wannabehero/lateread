import { contentCache } from "../lib/content-cache";
import { extractCleanContent } from "../lib/readability";

/**
 * Get article content from cache or fetch if missing
 * Throws error if content cannot be loaded
 */
export async function getArticleContent(
  articleId: string,
  articleUrl: string
): Promise<string> {
  // Try to load from cache
  let content = await contentCache.get(articleId);

  if (content) {
    return content;
  }

  // Cache miss - fetch on-demand
  console.log(`Cache miss for article ${articleId}, fetching on-demand...`);

  const extracted = await extractCleanContent(articleUrl);

  if (!extracted.content) {
    throw new Error("Failed to extract article content");
  }

  content = extracted.content;

  // Cache for future reads
  await contentCache.set(articleId, content);

  return content;
}
