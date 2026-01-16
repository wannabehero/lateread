import { type Context, Hono } from "hono";
import { z } from "zod";
import { ArticleCards } from "../components/ArticleCards";
import { ArticleList } from "../components/ArticleList";
import { ReaderView } from "../components/ReaderView";
import { isLLMAvailable } from "../lib/llm";
import { isTTSAvailable } from "../lib/tts";
import { validator } from "../lib/validator";
import { requireAuth } from "../middleware/auth";
import { articleIdParam } from "../schemas/common";
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

export async function renderArticlesList(
  c: Context<AppContext>,
  userId: string,
  archived: boolean = false,
  cursor?: string,
) {
  const [result, processingCount] = await Promise.all([
    getArticlesWithTags(userId, {
      archived,
      cursor,
    }),
    countArticlesByStatus(userId, ["pending", "processing"]),
  ]);

  // HTMX pagination request - return only article cards (when cursor is present)
  if (cursor && c.req.header("hx-request") === "true") {
    return c.html(
      <ArticleCards
        articles={result.articles}
        nextCursor={result.nextCursor}
        basePath={archived ? "/archive" : "/articles"}
        archived={archived}
      />,
    );
  }

  // Full page response (regular navigation or initial load)
  const content = (
    <ArticleList
      articles={result.articles}
      archived={archived}
      processingCount={processingCount}
      nextCursor={result.nextCursor}
    />
  );

  return renderWithLayout({ c, content });
}

/**
 * GET /articles - List articles
 */
articlesRouter.get(
  "/articles",
  requireAuth("redirect"),
  validator(
    "query",
    z.object({
      cursor: z.string().optional(),
    }),
  ),
  async (c) => {
    const userId = c.get("userId");
    const { cursor } = c.req.valid("query");
    return renderArticlesList(c, userId, false, cursor);
  },
);

/**
 * GET /archive - List archived articles
 */
articlesRouter.get(
  "/archive",
  requireAuth("redirect"),
  validator(
    "query",
    z.object({
      cursor: z.string().optional(),
    }),
  ),
  async (c) => {
    const userId = c.get("userId");
    const { cursor } = c.req.valid("query");
    return renderArticlesList(c, userId, true, cursor);
  },
);

/**
 * GET /articles/:id - Read article
 */
articlesRouter.get(
  "/articles/:id",
  requireAuth("redirect"),
  validator("param", articleIdParam),
  async (c) => {
    const userId = c.get("userId");
    const { id: articleId } = c.req.valid("param");

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
        readingPosition={{
          element: article.readingPositionElement,
          offset: article.readingPositionOffset,
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
            <reader-controls
              data-font-family={preferences.fontFamily}
              data-font-size={preferences.fontSize.toString()}
              data-api-url="/api/preferences/reader"
            />
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
  },
);

export default articlesRouter;
