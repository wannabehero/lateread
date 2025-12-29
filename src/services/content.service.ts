import { join } from "node:path";
import { config } from "../lib/config";
import { contentCache } from "../lib/content-cache";
import { ExternalServiceError } from "../lib/errors";
import { extractCleanContent } from "../lib/readability";

/**
 * Get article content from cache or fetch if missing
 * Throws error if content cannot be loaded
 */
export async function getArticleContent(
  userId: string,
  articleId: string,
  articleUrl: string,
): Promise<string> {
  // Try to load from cache
  let content = await contentCache.get(userId, articleId);

  if (content) {
    return content;
  }

  // Cache miss - fetch on-demand
  console.log(`Cache miss for article ${articleId}, fetching on-demand...`);

  const extracted = await extractCleanContent(articleUrl);

  if (!extracted.content) {
    throw new ExternalServiceError(
      "Readability content extraction",
      new Error("No content extracted"),
    );
  }

  content = extracted.content;

  // Cache for future reads
  await contentCache.set(userId, articleId, content);

  return content;
}

/**
 * Search cached article content using ripgrep
 * Returns array of article IDs whose cached content matches the search query
 *
 * Note: Cache files are named {userId}/{articleId}.html
 * Searches only within the specified user's cache directory for privacy
 */
export async function searchCachedArticleIds(
  userId: string,
  searchQuery: string,
): Promise<string[]> {
  try {
    const userCacheDir = join(config.CACHE_DIR, userId);

    // Use ripgrep to search through cached HTML files in user's directory
    // Cache files are stored as {userId}/{articleId}.html
    const proc = Bun.spawn(
      [
        "rg",
        "--files-with-matches",
        "--ignore-case",
        searchQuery,
        userCacheDir,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    // Exit code 0 = matches found, 1 = no matches, >1 = error
    if (exitCode > 1) {
      console.error("ripgrep search failed with exit code:", exitCode);
      return [];
    }

    // Extract article IDs from file paths
    // Cache files are named {articleId}.html (UUID format)
    const articleIds = output
      .split("\n")
      .filter((line) => line.trim())
      .map((filePath) => {
        const match = filePath.match(/([a-f0-9-]{36})\.html$/);
        return match ? match[1] : null;
      })
      .filter((id): id is string => id !== null);

    return articleIds;
  } catch (error) {
    console.error("Error searching cached content:", error);
    return [];
  }
}
