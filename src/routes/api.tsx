import { Hono } from "hono";
import { EmptyState } from "../components/EmptyState";
import { ProcessingBanner } from "../components/ProcessingBanner";
import { SummaryView } from "../components/SummaryView";
import { requireAuth } from "../middleware/auth";
import {
  countArticles,
  countArticlesByStatus,
  getArticleById,
  markArticleAsRead,
  toggleArticleArchive,
} from "../services/articles.service";
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

    // Return empty content to remove card from current view
    // User can navigate to other view (archive/unarchive) to see the article
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
api.get("/api/articles/processing-count", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId");

  try {
    const count = await countArticlesByStatus(userId, ["pending", "processing"]);
    return c.html(<ProcessingBanner count={count} />);
  } catch (error) {
    console.error("Error getting processing count:", error);
    return c.html(<ProcessingBanner count={0} />);
  }
});

export default api;
