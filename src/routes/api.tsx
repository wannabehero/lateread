import { eq, and, sql } from "drizzle-orm";
import { Hono } from "hono";
import { ArticleCard } from "../components/ArticleCard";
import { db, articles, tags, articleTags } from "../lib/db";
import { getSession } from "../lib/session";

const api = new Hono();

/**
 * POST /api/articles/:id/read - Mark article as read
 */
api.post("/api/articles/:id/read", async (c) => {
  const session = getSession(c);

  if (!session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const articleId = c.req.param("id");

  try {
    // Verify article exists and belongs to user
    const articlesList = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.id, articleId),
          eq(articles.userId, session.userId)
        )
      )
      .limit(1);

    if (articlesList.length === 0) {
      return c.json({ error: "Article not found" }, 404);
    }

    // Update readAt timestamp
    await db
      .update(articles)
      .set({ readAt: new Date() })
      .where(eq(articles.id, articleId));

    // For HTMX requests that want to replace the card, return updated card
    const hxTarget = c.req.header("hx-target");
    if (hxTarget?.includes("article-card")) {
      // Load article with tags for card rendering
      const updatedArticle = await db
        .select()
        .from(articles)
        .where(eq(articles.id, articleId))
        .limit(1);

      const articleTagsList = await db
        .select({
          id: tags.id,
          name: tags.name,
        })
        .from(articleTags)
        .innerJoin(tags, eq(articleTags.tagId, tags.id))
        .where(eq(articleTags.articleId, articleId));

      const articleWithTags = {
        ...updatedArticle[0],
        tags: articleTagsList,
      };

      return c.html(<ArticleCard article={articleWithTags} />);
    }

    // Default: return 204 No Content
    return c.body(null, 204);
  } catch (error) {
    console.error("Error marking article as read:", error);
    return c.json({ error: "Failed to mark article as read" }, 500);
  }
});

/**
 * POST /api/articles/:id/archive - Toggle article archive status
 */
api.post("/api/articles/:id/archive", async (c) => {
  const session = getSession(c);

  if (!session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const articleId = c.req.param("id");

  try {
    // Verify article exists and belongs to user
    const articlesList = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.id, articleId),
          eq(articles.userId, session.userId)
        )
      )
      .limit(1);

    if (articlesList.length === 0) {
      return c.json({ error: "Article not found" }, 404);
    }

    const article = articlesList[0];

    // Toggle archived status
    await db
      .update(articles)
      .set({ archived: !article.archived })
      .where(eq(articles.id, articleId));

    // Load updated article with tags for card rendering
    const updatedArticle = await db
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    const articleTagsList = await db
      .select({
        id: tags.id,
        name: tags.name,
      })
      .from(articleTags)
      .innerJoin(tags, eq(articleTags.tagId, tags.id))
      .where(eq(articleTags.articleId, articleId));

    const articleWithTags = {
      ...updatedArticle[0],
      tags: articleTagsList,
    };

    return c.html(<ArticleCard article={articleWithTags} />);
  } catch (error) {
    console.error("Error archiving article:", error);
    return c.json({ error: "Failed to archive article" }, 500);
  }
});

/**
 * POST /api/articles/:id/summarize - Generate article summary
 * (Placeholder for Phase 4)
 */
api.post("/api/articles/:id/summarize", async (c) => {
  const session = getSession(c);

  if (!session?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const articleId = c.req.param("id");

  try {
    // Verify article exists and belongs to user
    const articlesList = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.id, articleId),
          eq(articles.userId, session.userId)
        )
      )
      .limit(1);

    if (articlesList.length === 0) {
      return c.json({ error: "Article not found" }, 404);
    }

    // Placeholder: Return message that feature is coming in Phase 4
    return c.html(
      <div class="summary-placeholder">
        <p><em>Summary generation coming soon in Phase 4!</em></p>
      </div>
    );
  } catch (error) {
    console.error("Error generating summary:", error);
    return c.json({ error: "Failed to generate summary" }, 500);
  }
});

export default api;
