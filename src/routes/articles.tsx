import { eq, and, desc, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { Layout } from "../components/Layout";
import { ArticleList } from "../components/ArticleList";
import { ReaderView } from "../components/ReaderView";
import { contentCache } from "../lib/content-cache";
import { db, articles, tags, articleTags } from "../lib/db";
import { extractCleanContent } from "../lib/readability";
import { getSession } from "../lib/session";

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
  currentPath?: string,
): Response {
  const session = getSession(c);

  if (isHtmxRequest(c)) {
    return c.html(content);
  }

  return c.html(
    <Layout
      title={title}
      isAuthenticated={!!session}
      currentPath={currentPath}
    >
      {content}
    </Layout>
  );
}

/**
 * Helper: Load articles with tags
 */
async function loadArticlesWithTags(
  userId: string,
  filters: {
    archived?: boolean;
    tag?: string;
  } = {}
) {
  // Build query conditions
  const conditions = [eq(articles.userId, userId)];

  if (filters.archived !== undefined) {
    conditions.push(eq(articles.archived, filters.archived));
  }

  // Only show completed articles
  conditions.push(eq(articles.status, "completed"));

  // Query articles
  const articlesList = await db
    .select()
    .from(articles)
    .where(and(...conditions))
    .orderBy(desc(articles.createdAt))
    .limit(50);

  // Filter by tag if specified
  let filteredArticles = articlesList;
  if (filters.tag) {
    const tagName = filters.tag.toLowerCase();

    // Get article IDs that have this tag
    const articleIdsWithTag = await db
      .select({ articleId: articleTags.articleId })
      .from(articleTags)
      .innerJoin(tags, eq(articleTags.tagId, tags.id))
      .where(
        and(
          eq(tags.userId, userId),
          eq(sql`lower(${tags.name})`, tagName)
        )
      );

    const articleIdSet = new Set(articleIdsWithTag.map(at => at.articleId));
    filteredArticles = articlesList.filter(a => articleIdSet.has(a.id));
  }

  // Load tags for each article
  const articlesWithTags = await Promise.all(
    filteredArticles.map(async (article) => {
      const articleTagsList = await db
        .select({
          id: tags.id,
          name: tags.name,
        })
        .from(articleTags)
        .innerJoin(tags, eq(articleTags.tagId, tags.id))
        .where(eq(articleTags.articleId, article.id));

      return {
        ...article,
        tags: articleTagsList,
      };
    })
  );

  return articlesWithTags;
}

/**
 * GET /articles - List articles
 */
articlesRouter.get("/articles", async (c) => {
  const session = getSession(c);

  if (!session?.userId) {
    return c.redirect("/");
  }

  // Parse query params
  const status = c.req.query("status") || "unread";
  const tag = c.req.query("tag");

  const archived = status === "archived";

  try {
    const articlesWithTags = await loadArticlesWithTags(session.userId, {
      archived,
      tag,
    });

    const content = <ArticleList articles={articlesWithTags} status={status} tag={tag} />;

    return renderWithLayout(
      c,
      tag ? `Articles tagged "${tag}"` : status === "archived" ? "Archived Articles" : "Unread Articles",
      content,
      `/articles?status=${status}`
    );
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
articlesRouter.get("/articles/:id", async (c) => {
  const session = getSession(c);

  if (!session?.userId) {
    return c.redirect("/");
  }

  const articleId = c.req.param("id");

  try {
    // Query article
    const articlesList = await db
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (articlesList.length === 0) {
      return c.html(
        <div class="error">
          <p>Article not found</p>
        </div>,
        404
      );
    }

    const article = articlesList[0];

    // Verify ownership
    if (article.userId !== session.userId) {
      return c.html(
        <div class="error">
          <p>Access denied</p>
        </div>,
        403
      );
    }

    // Load tags
    const articleTagsList = await db
      .select({
        id: tags.id,
        name: tags.name,
      })
      .from(articleTags)
      .innerJoin(tags, eq(articleTags.tagId, tags.id))
      .where(eq(articleTags.articleId, article.id));

    const articleWithTags = {
      ...article,
      tags: articleTagsList,
    };

    // Try to load cached content
    let content = await contentCache.get(articleId);

    // If cache miss, fetch on-demand
    if (!content) {
      console.log(`Cache miss for article ${articleId}, fetching on-demand...`);

      try {
        const extracted = await extractCleanContent(article.url);
        content = extracted.content || "<p>Failed to extract article content</p>";

        // Cache for future reads
        await contentCache.set(articleId, content);

        // Update metadata if it's missing
        if (!article.title && extracted.title) {
          await db
            .update(articles)
            .set({
              title: extracted.title,
              description: extracted.description || article.description,
              imageUrl: extracted.imageUrl || article.imageUrl,
              siteName: extracted.siteName || article.siteName,
            })
            .where(eq(articles.id, articleId));
        }
      } catch (error) {
        console.error(`Failed to fetch article ${articleId}:`, error);
        content = `<div class="error"><p>Failed to load article content. <a href="${article.url}" target="_blank">View original</a></p></div>`;
      }
    }

    const readerContent = <ReaderView article={articleWithTags} content={content} />;

    return renderWithLayout(
      c,
      articleWithTags.title || "Article",
      readerContent,
      "/articles"
    );
  } catch (error) {
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
