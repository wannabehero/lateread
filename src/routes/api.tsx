import { Hono } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";
import { ArticleList } from "../components/ArticleList";
import { EmptyState } from "../components/EmptyState";
import { ProcessingBanner } from "../components/ProcessingBanner";
import { SummaryView } from "../components/SummaryView";
import { getTTSProvider, htmlToPlainText } from "../lib/tts";
import { validator } from "../lib/validator";
import { requireAuth } from "../middleware/auth";
import { articleIdParam } from "../schemas/common";
import {
  countArticles,
  countArticlesByStatus,
  deleteArticle,
  getArticlesWithTags,
  getArticleWithTagsById,
  markArticleAsRead,
  rateArticle,
  toggleArticleArchive,
  updateReadingPosition,
} from "../services/articles.service";
import { getArticleContent } from "../services/content.service";
import { updateReaderPreferences } from "../services/preferences.service";
import { getOrGenerateSummary } from "../services/summaries.service";
import type { AppContext } from "../types/context";

const api = new Hono<AppContext>();

/**
 * POST /api/articles/:id/read - Mark article as read
 */
api.post(
  "/api/articles/:id/read",
  requireAuth("json-401"),
  validator("param", articleIdParam),
  async (c) => {
    const userId = c.get("userId");
    const { id: articleId } = c.req.valid("param");

    await markArticleAsRead(articleId, userId);

    return c.body(null, 204);
  },
);

/**
 * POST /api/articles/:id/position - Save reading position
 */
api.post(
  "/api/articles/:id/position",
  requireAuth("json-401"),
  validator("param", articleIdParam),
  validator(
    "form",
    z.object({
      element: z.coerce
        .number()
        .int()
        .min(0, "Element index must be non-negative"),
      offset: z.coerce
        .number()
        .int()
        .min(0, "Offset must be non-negative")
        .max(100, "Offset must be at most 100"),
    }),
  ),
  async (c) => {
    const userId = c.get("userId");
    const { id: articleId } = c.req.valid("param");
    const { element, offset } = c.req.valid("form");

    await updateReadingPosition(articleId, userId, { element, offset });

    return c.body(null, 204);
  },
);

/**
 * POST /api/articles/:id/archive - Toggle article archive status
 */
api.post(
  "/api/articles/:id/archive",
  requireAuth("json-401"),
  validator("param", articleIdParam),
  validator(
    "query",
    z.object({
      redirect: z
        .enum(["true", "false"], {
          message: "Redirect must be 'true' or 'false'",
        })
        .optional()
        .transform((val) => val === "true"),
    }),
  ),
  async (c) => {
    const userId = c.get("userId");
    const { id: articleId } = c.req.valid("param");
    const { redirect: shouldRedirect } = c.req.valid("query");

    c.var.logger.info("Archiving article", { articleId, userId });

    const newStatus = await toggleArticleArchive(articleId, userId);

    const remainingCount = await countArticles(userId, {
      archived: !newStatus,
    });

    c.header(
      "x-toast-message",
      newStatus ? "Article archived" : "Article unarchived",
    );

    // If redirect param is present (from reader view), redirect to articles list
    if (shouldRedirect) {
      c.header("hx-trigger", "scrollToTop");
      c.header("hx-location", "/articles");
      return c.body(null, 204);
    }

    // Otherwise, return empty content to remove card from current view
    // User can navigate to other view (archive/unarchive) to see the article
    return c.html(
      // biome-ignore lint/complexity/noUselessFragments: we have to
      <>
        {remainingCount === 0 && (
          <div id="article-container" hx-swap-oob="true">
            <EmptyState archived={!newStatus} />
          </div>
        )}
      </>,
    );
  },
);

/**
 * POST /api/articles/:id/rate - Rate and archive article
 */
api.post(
  "/api/articles/:id/rate",
  requireAuth("json-401"),
  validator("param", articleIdParam),
  validator(
    "query",
    z.object({
      rating: z
        .enum(["-1", "1"], { message: "Rating must be '-1' or '1'" })
        .transform((v) => Number.parseInt(v, 10) as -1 | 1),
    }),
  ),
  async (c) => {
    const userId = c.get("userId");
    const { id: articleId } = c.req.valid("param");
    const { rating } = c.req.valid("query");

    c.var.logger.info("Rating article", { articleId, userId, rating });

    await rateArticle(articleId, userId, rating);

    c.header(
      "x-toast-message",
      rating === 1 ? "Article liked" : "Article disliked",
    );
    c.header("hx-trigger", "scrollToTop");
    c.header("hx-location", "/articles");
    return c.body(null, 204);
  },
);

/**
 * DELETE /api/articles/:id - Delete an article
 */
api.delete(
  "/api/articles/:id",
  requireAuth("json-401"),
  validator("param", articleIdParam),
  async (c) => {
    const userId = c.get("userId");
    const { id: articleId } = c.req.valid("param");

    c.var.logger.info("Deleting article", { articleId, userId });

    await deleteArticle(articleId, userId);

    c.header("x-toast-message", "Article deleted");
    c.header("hx-trigger", "scrollToTop");
    c.header("hx-location", "/articles");
    return c.body(null, 204);
  },
);

/**
 * POST /api/articles/:id/summarize - Generate article summary
 */
api.post(
  "/api/articles/:id/summarize",
  requireAuth("json-401"),
  validator("param", articleIdParam),
  async (c) => {
    const userId = c.get("userId");
    const { id: articleId } = c.req.valid("param");

    // Verify article exists and belongs to user
    const article = await getArticleWithTagsById(articleId, userId);

    // Get or generate summary in article's language
    const summary = await getOrGenerateSummary(
      userId,
      articleId,
      article.url,
      article.language,
    );

    // Return summary view
    return c.html(<SummaryView summary={summary} />);
  },
);

/**
 * GET /api/articles/processing-count - Get count of processing articles
 */
api.get(
  "/api/articles/processing-count",
  requireAuth("json-401"),
  validator(
    "query",
    z.object({
      previous: z.coerce.number().int().min(0).optional(),
    }),
  ),
  async (c) => {
    const userId = c.get("userId");
    const { previous } = c.req.valid("query");

    try {
      const count = await countArticlesByStatus(userId, [
        "pending",
        "processing",
      ]);

      // If count has changed, refresh the article list with OOB swap
      if (previous !== undefined && count !== previous) {
        const result = await getArticlesWithTags(userId, { archived: false });

        return c.html(
          <>
            <ProcessingBanner count={count} />
            <ArticleList
              articles={result.articles}
              archived={false}
              processingCount={count}
              nextCursor={result.nextCursor}
              oobSwap="true"
            />
          </>,
        );
      }

      // No change - just return the banner
      return c.html(<ProcessingBanner count={count} />);
    } catch (error) {
      c.var.logger.error("Error getting processing count", { error });
      return c.html(<ProcessingBanner count={0} />);
    }
  },
);

/**
 * GET /api/articles/:id/tts - Stream text-to-speech audio for article
 */
api.get(
  "/api/articles/:id/tts",
  requireAuth("json-401"),
  validator("param", articleIdParam),
  async (c) => {
    const userId = c.get("userId");
    const { id: articleId } = c.req.valid("param");

    // Verify article exists and belongs to user
    const article = await getArticleWithTagsById(articleId, userId);

    // Get article content from cache
    const htmlContent = await getArticleContent(userId, articleId, article.url);

    // Convert HTML to plain text
    const plainText = htmlToPlainText(htmlContent);

    if (!plainText) {
      return c.json({ error: "No content available for TTS" }, 400);
    }

    const ttsProvider = getTTSProvider();
    const audioStream = await ttsProvider.generateStream(
      plainText,
      article.language,
    );

    // Set appropriate headers for audio streaming
    c.header("Content-Type", "audio/mpeg");
    c.header("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    // Stream the audio to the response using ReadableStream reader
    return stream(c, async (streamWriter) => {
      const reader = audioStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await streamWriter.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    });
  },
);

/**
 * POST /api/preferences/reader - Update reader font preferences
 */
api.post(
  "/api/preferences/reader",
  requireAuth("json-401"),
  validator(
    "form",
    z.object({
      fontFamily: z.enum(["sans", "serif", "new-york"], {
        message: "Font family must be 'sans', 'serif', or 'new-york'",
      }),
      fontSize: z.coerce
        .number({
          message: "Font size must be a number",
        })
        .int("Font size must be a whole number")
        .min(14, "Font size must be at least 14")
        .max(24, "Font size must be at most 24"),
    }),
  ),
  async (c) => {
    const userId = c.get("userId");
    const { fontFamily, fontSize } = c.req.valid("form");

    await updateReaderPreferences(userId, { fontFamily, fontSize });

    return c.json({ success: true });
  },
);

export default api;
