import type { Context } from "hono";
import { Hono } from "hono";
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
                  <article class={`article-card ${article.read ? "read" : ""}`}>
                    {article.imageUrl && (
                      <div class="article-image">
                        <img
                          src={article.imageUrl}
                          alt={article.title || "Article"}
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div class="article-content">
                      <h3>
                        <a href={`/articles/${article.id}`}>{article.title}</a>
                      </h3>
                      {article.description && (
                        <p class="article-description">{article.description}</p>
                      )}
                      <div class="article-meta">
                        {article.siteName && <span>{article.siteName}</span>}
                        {article.siteName && article.publishedAt && (
                          <span> • </span>
                        )}
                        {article.publishedAt && (
                          <time>
                            {new Date(article.publishedAt).toLocaleDateString()}
                          </time>
                        )}
                        {article.archived && (
                          <>
                            <span> • </span>
                            <span>Archived</span>
                          </>
                        )}
                      </div>
                      {article.tags && article.tags.length > 0 && (
                        <div class="article-tags">
                          {article.tags.map((tag) => (
                            <a
                              href={`/articles?tag=${tag.name}`}
                              class="tag-badge"
                            >
                              {tag.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
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
      <Layout title={title} isAuthenticated={true} currentPath="/search">
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
