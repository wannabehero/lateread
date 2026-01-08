import { type Context, Hono } from "hono";
import { z } from "zod";
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

export async function renderArticlesList(c: Context<AppContext>) {
  const userId = c.get("userId");

  const { status, tag } = c.req.valid("query");
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
articlesRouter.get(
  "/articles",
  requireAuth("redirect"),
  validator(
    "query",
    z.object({
      status: z
        .enum(["all", "archived"], {
          message: "Status must be 'all' or 'archived'",
        })
        .optional()
        .default("all"),
      tag: z
        .string()
        .min(1, "Tag cannot be empty")
        .transform((val) => val.toLowerCase().trim())
        .optional(),
    }),
  ),
  async (c) => {
    return renderArticlesList(c);
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
