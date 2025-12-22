import { Hono } from "hono";
import { ArticleCard } from "../components/ArticleCard";
import { requireAuth } from "../middleware/auth";
import {
  getArticleById,
  markArticleAsRead,
  toggleArticleArchive,
} from "../services/articles.service";
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
    await toggleArticleArchive(articleId, userId);

    // Load updated article with tags for card rendering
    const updatedArticle = await getArticleById(articleId, userId);

    return c.html(<ArticleCard article={updatedArticle} />);
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
 * (Placeholder for Phase 4)
 */
api.post("/api/articles/:id/summarize", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId");
  const articleId = c.req.param("id");

  try {
    // Verify article exists and belongs to user
    await getArticleById(articleId, userId);

    // Placeholder: Return message that feature is coming in Phase 4
    return c.html(
      <div class="summary-placeholder">
        <p>
          <em>Summary generation coming soon in Phase 4!</em>
        </p>
      </div>,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (errorMessage === "Article not found") {
      return c.json({ error: "Article not found" }, 404);
    }

    console.error("Error generating summary:", error);
    return c.json({ error: "Failed to generate summary" }, 500);
  }
});

export default api;
