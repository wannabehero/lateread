import { Hono } from "hono";
import type { Context } from "hono";
import { Layout } from "../components/Layout";
import { ArticleList } from "../components/ArticleList";
import { ReaderView } from "../components/ReaderView";
import { contentCache } from "../lib/content-cache";
import { extractCleanContent } from "../lib/readability";
import { requireAuth } from "../middleware/auth";
import {
  getArticlesWithTags,
  getArticleById,
  updateArticleMetadata,
} from "../services/articles.service";

const articlesRouter = new Hono();

/**
 * Helper: Check if request is from HTMX
 */
function isHtmxRequest(c: Context): boolean {
  return c.req.header("hx-request") === "true";
}

/**
 * Helper: Render with Layout or return partial
 */
function renderWithLayout(
  c: Context,
  title: string,
  content: JSX.Element,
  currentPath?: string
): Response {
  if (isHtmxRequest(c)) {
    return c.html(content);
  }

  return c.html(
    <Layout title={title} isAuthenticated={true} currentPath={currentPath}>
      {content}
    </Layout>
  );
}

/**
 * GET /articles - List articles
 */
articlesRouter.get("/articles", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId") as string;

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
      500
    );
  }
});

/**
 * GET /articles/:id - Read article
 */
articlesRouter.get("/articles/:id", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId") as string;
  const articleId = c.req.param("id");

  try {
    // Get article with tags
    const article = await getArticleById(articleId, userId);

    // Try to load cached content
    let content = await contentCache.get(articleId);

    // If cache miss, fetch on-demand
    if (!content) {
      console.log(`Cache miss for article ${articleId}, fetching on-demand...`);

      try {
        const extracted = await extractCleanContent(article.url);
        content =
          extracted.content || "<p>Failed to extract article content</p>";

        // Cache for future reads
        await contentCache.set(articleId, content);

        // Update metadata if it's missing
        if (!article.title && extracted.title) {
          await updateArticleMetadata(articleId, {
            title: extracted.title,
            description: extracted.description || article.description || undefined,
            imageUrl: extracted.imageUrl || article.imageUrl || undefined,
            siteName: extracted.siteName || article.siteName || undefined,
          });
        }
      } catch (error) {
        console.error(`Failed to fetch article ${articleId}:`, error);
        content = `<div class="error"><p>Failed to load article content. <a href="${article.url}" target="_blank">View original</a></p></div>`;
      }
    }

    const readerContent = <ReaderView article={article} content={content} />;

    return renderWithLayout(
      c,
      article.title || "Article",
      readerContent,
      "/articles"
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage === "Article not found") {
      return c.html(
        <div class="error">
          <p>Article not found</p>
        </div>,
        404
      );
    }

    if (errorMessage === "Access denied") {
      return c.html(
        <div class="error">
          <p>Access denied</p>
        </div>,
        403
      );
    }

    console.error("Error loading article:", error);
    return c.html(
      <div class="error">
        <p>Failed to load article. Please try again.</p>
      </div>,
      500
    );
  }
});

export default articlesRouter;
