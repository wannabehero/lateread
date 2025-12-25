import { Hono } from "hono";
import { stream } from "hono/streaming";
import { EmptyState } from "../components/EmptyState";
import { ProcessingBanner } from "../components/ProcessingBanner";
import { SummaryView } from "../components/SummaryView";
import { generateTTSStream, htmlToPlainText } from "../lib/tts";
import { requireAuth } from "../middleware/auth";
import {
  countArticles,
  countArticlesByStatus,
  getArticleById,
  markArticleAsRead,
  toggleArticleArchive,
} from "../services/articles.service";
import { getArticleContent } from "../services/content.service";
import { updateReaderPreferences } from "../services/preferences.service";
import { getOrGenerateSummary } from "../services/summaries.service";
import type { AppContext } from "../types/context";

const api = new Hono<AppContext>();

/**
 * POST /api/articles/:id/read - Mark article as read
 */
api.post("/api/articles/:id/read", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId");
  const articleId = c.req.param("id");

  try {
    await markArticleAsRead(articleId, userId);

    // Default: return 204 No Content
    return c.body(null, 204);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (errorMessage === "Article not found") {
      return c.json({ error: "Article not found" }, 404);
    }

    console.error("Error marking article as read:", error);
    return c.json({ error: "Failed to mark article as read" }, 500);
  }
});

/**
 * POST /api/articles/:id/archive - Toggle article archive status
 */
api.post("/api/articles/:id/archive", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId");
  const articleId = c.req.param("id");

  try {
    const newStatus = await toggleArticleArchive(articleId, userId);

    const remainingCount = await countArticles(userId, {
      archived: !newStatus,
    });

    c.header(
      "x-toast-message",
      newStatus ? "Article archived" : "Article unarchived",
    );

    // Return empty content to remove card from current view
    // User can navigate to other view (archive/unarchive) to see the article
    // TODO: might as well delete the article div via id or something
    return c.html(
      <>
        <div />
        {remainingCount === 0 ? (
          <div id="article-container" hx-swap-oob="true">
            <EmptyState message="No articles yet..." />
          </div>
        ) : (
          {}
        )}
      </>,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (errorMessage === "Article not found") {
      return c.json({ error: "Article not found" }, 404);
    }

    console.error("Error archiving article:", error);
    return c.json({ error: "Failed to archive article" }, 500);
  }
});

/**
 * POST /api/articles/:id/summarize - Generate article summary
 */
api.post("/api/articles/:id/summarize", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId");
  const articleId = c.req.param("id");

  try {
    // Verify article exists and belongs to user
    const article = await getArticleById(articleId, userId);

    // Get or generate summary
    const summary = await getOrGenerateSummary(userId, articleId, article.url);

    // Return summary view
    return c.html(<SummaryView summary={summary} />);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (errorMessage === "Article not found") {
      return c.html(
        <div class="summary-error">
          <p>Article not found</p>
        </div>,
        404,
      );
    }

    console.error("Error generating summary:", error);
    return c.html(
      <div class="summary-error">
        <p>Failed to generate summary. Please try again.</p>
      </div>,
      500,
    );
  }
});

/**
 * GET /api/articles/processing-count - Get count of processing articles
 */
api.get(
  "/api/articles/processing-count",
  requireAuth("json-401"),
  async (c) => {
    const userId = c.get("userId");

    try {
      const count = await countArticlesByStatus(userId, [
        "pending",
        "processing",
      ]);
      return c.html(<ProcessingBanner count={count} />);
    } catch (error) {
      console.error("Error getting processing count:", error);
      return c.html(<ProcessingBanner count={0} />);
    }
  },
);

/**
 * GET /api/articles/:id/tts - Stream text-to-speech audio for article
 */
api.get("/api/articles/:id/tts", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId");
  const articleId = c.req.param("id");

  try {
    // Verify article exists and belongs to user
    const article = await getArticleById(articleId, userId);

    // Get article content from cache
    const htmlContent = await getArticleContent(userId, articleId, article.url);

    // Convert HTML to plain text
    const plainText = htmlToPlainText(htmlContent);

    if (!plainText) {
      return c.json({ error: "No content available for TTS" }, 400);
    }

    // Generate TTS audio stream with language-appropriate voice
    const audioStream = await generateTTSStream(plainText, article.language);

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
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (errorMessage === "Article not found") {
      return c.json({ error: "Article not found" }, 404);
    }

    console.error("Error generating TTS:", error);
    return c.json({ error: "Failed to generate audio" }, 500);
  }
});

/**
 * POST /api/preferences/reader - Update reader font preferences
 */
api.post("/api/preferences/reader", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId");

  try {
    const formData = await c.req.formData();
    const fontFamilyValue = formData.get("fontFamily") as string;
    const fontSize = Number(formData.get("fontSize"));

    if (!["sans", "serif", "new-york"].includes(fontFamilyValue)) {
      return c.json({ error: "Invalid font family" }, 400);
    }

    if (fontSize < 14 || fontSize > 24) {
      return c.json({ error: "Font size must be between 14 and 24" }, 400);
    }

    // Type is now narrowed after validation
    const fontFamily = fontFamilyValue as "sans" | "serif" | "new-york";

    await updateReaderPreferences(userId, { fontFamily, fontSize });

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating reader preferences:", error);
    return c.json({ error: "Failed to update preferences" }, 500);
  }
});

export default api;
