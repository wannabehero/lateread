import { type Context, Hono } from "hono";
import { ArticleList } from "../components/ArticleList";
import { ReaderControls } from "../components/ReaderControls";
import { ReaderView } from "../components/ReaderView";
import { isLLMAvailable } from "../lib/llm";
import { isTTSAvailable } from "../lib/tts";
import { requireAuth } from "../middleware/auth";
import {
  countArticlesByStatus,
  getArticlesWithTags,
  getArticleWithTagsById,
} from "../services/articles.service";
import { getArticleContent } from "../services/content.service";
import { getReaderPreferences } from "../services/preferences.service";
import { getAllowedFeaturesForUser } from "../services/subscription.service";
import type { AppContext } from "../types/context";
import { renderWithLayout } from "./utils/render";

const articlesRouter = new Hono<AppContext>();

export async function renderArticlesList(c: Context<AppContext>) {
  const userId = c.get("userId");

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

  return renderWithLayout({ c, content });
}

/**
 * GET /articles - List articles
 */
articlesRouter.get("/articles", requireAuth("redirect"), async (c) => {
  return renderArticlesList(c);
});

/**
 * GET /articles/:id - Read article
 */
articlesRouter.get("/articles/:id", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId");
  const articleId = c.req.param("id");

  // Get article with tags
  const [article, preferences, features] = await Promise.all([
    getArticleWithTagsById(articleId, userId),
    getReaderPreferences(userId),
    getAllowedFeaturesForUser(userId),
  ]);

  const content = await getArticleContent(userId, articleId, article.url);

  const readerContent = (
    <ReaderView
      article={article}
      content={content}
      features={{
        summary: features.summary && isLLMAvailable(),
        tts: features.tts && isTTSAvailable(),
      }}
    />
  );

  const readerControls = (
    <div class="nav-actions">
      <div class="nav-menu reader-settings-menu">
        <button type="button" class="nav-icon-button">
          <img
            src="/public/assets/settings-2.svg"
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

  return renderWithLayout({
    c,
    content: readerContent,
    overrideControls: readerControls,
    collapsibleHeader: true,
  });
});

export default articlesRouter;
