import { contentCache } from "../lib/content-cache";
import { extractCleanContent } from "../lib/readability";

/**
 * Get article content from cache or fetch if missing
 * Returns the HTML content or an error message
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

  try {
    const extracted = await extractCleanContent(articleUrl);
    content = extracted.content || "<p>Failed to extract article content</p>";

    // Cache for future reads
    await contentCache.set(articleId, content);

    return content;
  } catch (error) {
    console.error(`Failed to fetch article ${articleId}:`, error);
    return `<div class="error"><p>Failed to load article content. <a href="${articleUrl}" target="_blank">View original</a></p></div>`;
  }
}
