import type { Context } from "hono";
import { Hono } from "hono";
import { ArticleList } from "../components/ArticleList";
import { Layout } from "../components/Layout";
import { ReaderControls } from "../components/ReaderControls";
import { ReaderView } from "../components/ReaderView";
import { requireAuth } from "../middleware/auth";
import {
  countArticlesByStatus,
  getArticleById,
  getArticlesWithTags,
} from "../services/articles.service";
import { getArticleContent } from "../services/content.service";
import { getReaderPreferences } from "../services/preferences.service";
import type { AppContext } from "../types/context";

const articlesRouter = new Hono<AppContext>();

/**
 * Helper: Render with Layout or return partial
 */
function renderWithLayout(
  c: Context<AppContext>,
  // biome-ignore lint/suspicious/noExplicitAny: can be any JSX content
  content: any,
  // biome-ignore lint/suspicious/noExplicitAny: can be any JSX content
  overrideControls?: any,
  collapsibleHeader = false,
): Response | Promise<Response> {
  return c.html(
    <Layout
      isAuthenticated={true}
      overrideControls={overrideControls}
      collapsibleHeader={collapsibleHeader}
    >
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
  const status = c.req.query("status") || "all";
  const tag = c.req.query("tag");

  const archived = status === "archived";

  const [articlesWithTags, processingCount] = await Promise.all([
    getArticlesWithTags(userId, {
      archived,
      tag,
    }),
    countArticlesByStatus(userId, ["pending", "processing"]),
  ]);

  const content = (
    <ArticleList
      articles={articlesWithTags}
      archived={archived}
      tag={tag}
      processingCount={processingCount}
    />
  );

  return renderWithLayout(c, content);
});

/**
 * GET /articles/:id - Read article
 */
articlesRouter.get("/articles/:id", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId");
  const articleId = c.req.param("id");

  // Get article with tags
  const [article, preferences] = await Promise.all([
    getArticleById(articleId, userId),
    getReaderPreferences(userId),
  ]);

  // Get content from cache or fetch if missing
  const content = await getArticleContent(userId, articleId, article.url);

  const readerContent = <ReaderView article={article} content={content} />;

  const readerControls = (
    <div class="nav-actions">
      <div class="nav-menu reader-settings-menu">
        <button type="button" class="nav-icon-button">
          <img
            src="/public/icons/settings-2.svg"
            alt="Settings"
            class="nav-icon"
          />
        </button>
        <div class="nav-dropdown reader-settings-dropdown">
          <ReaderControls preferences={preferences} />
        </div>
      </div>
    </div>
  );

  return renderWithLayout(c, readerContent, readerControls, true);
});

export default articlesRouter;
