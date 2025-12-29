import type { Context } from "hono";
import { Hono } from "hono";
import { ArticleCard } from "../components/ArticleCard";
import { Layout } from "../components/Layout";
import { SearchPage } from "../components/SearchPage";
import { requireAuth } from "../middleware/auth";
import { getArticlesWithTags } from "../services/articles.service";
import type { AppContext } from "../types/context";

const searchRouter = new Hono<AppContext>();

/**
 * Helper: Check if request is from HTMX
 */
function isHtmxRequest(c: Context<AppContext>): boolean {
  return c.req.header("hx-request") === "true";
}

/**
 * GET /search - Search all articles
 */
searchRouter.get("/search", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId");
  const query = c.req.query("q");

  try {
    // Search across all statuses (no archived filter)
    const articles = query ? await getArticlesWithTags(userId, { query }) : [];

    const content = <SearchPage query={query} articles={articles} />;

    // If HTMX request, return only the search results section
    if (isHtmxRequest(c)) {
      return c.html(
        <div id="search-results">
          {query ? (
            articles.length > 0 ? (
              <div class="article-grid">
                {articles.map((article) => (
                  <ArticleCard article={article} displayActions={false} />
                ))}
              </div>
            ) : (
              <div class="empty-state">
                <p>No articles found for "{query}"</p>
              </div>
            )
          ) : (
            <div class="empty-state">
              <p>Enter a search query to find articles</p>
            </div>
          )}
        </div>,
      );
    }

    // Full page render
    const title = query ? `Search: "${query}"` : "Search";
    return c.html(
      <Layout title={title} isAuthenticated={true}>
        {content}
      </Layout>,
    );
  } catch (error) {
    console.error("Error searching articles:", error);
    return c.html(
      <div class="error">
        <p>Failed to search articles. Please try again.</p>
      </div>,
      500,
    );
  }
});

export default searchRouter;
