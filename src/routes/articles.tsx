import type { Context } from "hono";
import { Hono } from "hono";
import { ArticleList } from "../components/ArticleList";
import { Layout } from "../components/Layout";
import { ReaderView } from "../components/ReaderView";
import { requireAuth } from "../middleware/auth";
import {
  getArticleById,
  getArticlesWithTags,
} from "../services/articles.service";
import { getArticleContent } from "../services/content.service";
import type { AppContext } from "../types/context";

const articlesRouter = new Hono<AppContext>();

/**
 * Helper: Check if request is from HTMX
 */
function isHtmxRequest(c: Context<AppContext>): boolean {
  return c.req.header("hx-request") === "true";
}

/**
 * Helper: Render with Layout or return partial
 */
function renderWithLayout(
  c: Context<AppContext>,
  title: string,
  // biome-ignore lint/suspicious/noExplicitAny: can be any JSX content
  content: any,
  currentPath?: string,
): Response | Promise<Response> {
  if (isHtmxRequest(c)) {
    return c.html(content);
  }

  return c.html(
    <Layout title={title} isAuthenticated={true} currentPath={currentPath}>
      {content}
    </Layout>,
  );
}

/**
 * GET /articles - List articles
 */
articlesRouter.get("/articles", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId");

  // Parse query params
  const status = c.req.query("status") || "unread";
  const tag = c.req.query("tag");

  const archived = status === "archived";

  try {
    const articlesWithTags = await getArticlesWithTags(userId, {
      archived,
      tag,
    });

    const content = (
      <ArticleList articles={articlesWithTags} status={status} tag={tag} />
    );

    const title = tag
      ? `Articles tagged "${tag}"`
      : status === "archived"
        ? "Archived Articles"
        : "Unread Articles";

    return renderWithLayout(c, title, content, `/articles?status=${status}`);
  } catch (error) {
    console.error("Error loading articles:", error);
    return c.html(
      <div class="error">
        <p>Failed to load articles. Please try again.</p>
      </div>,
      500,
    );
  }
});

/**
 * GET /articles/:id - Read article
 */
articlesRouter.get("/articles/:id", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId");
  const articleId = c.req.param("id");

  try {
    // Get article with tags
    const article = await getArticleById(articleId, userId);

    // Get content from cache or fetch if missing
    const content = await getArticleContent(articleId, article.url);

    const readerContent = <ReaderView article={article} content={content} />;

    return renderWithLayout(
      c,
      article.title || "Article",
      readerContent,
      "/articles",
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (errorMessage === "Article not found") {
      return c.html(
        <div class="error">
          <p>Article not found</p>
        </div>,
        404,
      );
    }

    console.error("Error loading article:", error);

    // Try to get article URL for fallback link
    let articleUrl: string | null = null;
    try {
      const article = await getArticleById(articleId, userId);
      articleUrl = article.url;
    } catch {
      // Ignore - article lookup failed
    }

    return c.html(
      <div class="error">
        <p>Failed to load article content.</p>
        {articleUrl && (
          <p>
            <a href={articleUrl} target="_blank" rel="noopener noreferrer">
              View original article
            </a>
          </p>
        )}
      </div>,
      500,
    );
  }
});

export default articlesRouter;
