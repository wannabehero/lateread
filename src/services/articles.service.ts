import { eq, and, desc, sql } from "drizzle-orm";
import { db, articles, tags, articleTags } from "../lib/db";

export interface ArticleWithTags {
  id: string;
  userId: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "error";
  archived: boolean;
  processingAttempts: number;
  lastError: string | null;
  createdAt: Date;
  processedAt: Date | null;
  readAt: Date | null;
  updatedAt: Date;
  tags: Array<{ id: string; name: string }>;
}

export interface GetArticlesFilters {
  archived?: boolean;
  tag?: string;
}

/**
 * Get articles with tags for a user
 */
export async function getArticlesWithTags(
  userId: string,
  filters: GetArticlesFilters = {}
): Promise<ArticleWithTags[]> {
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
      .where(and(eq(tags.userId, userId), eq(sql`lower(${tags.name})`, tagName)));

    const articleIdSet = new Set(articleIdsWithTag.map((at) => at.articleId));
    filteredArticles = articlesList.filter((a) => articleIdSet.has(a.id));
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
 * Get a single article by ID with tags
 * Throws error if not found or user doesn't have access
 */
export async function getArticleById(
  articleId: string,
  userId: string
): Promise<ArticleWithTags> {
  const articlesList = await db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (articlesList.length === 0) {
    throw new Error("Article not found");
  }

  const article = articlesList[0];

  // Verify ownership
  if (article.userId !== userId) {
    throw new Error("Access denied");
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

  return {
    ...article,
    tags: articleTagsList,
  };
}

/**
 * Mark article as read
 */
export async function markArticleAsRead(
  articleId: string,
  userId: string
): Promise<void> {
  // Verify article exists and belongs to user
  const articlesList = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);

  if (articlesList.length === 0) {
    throw new Error("Article not found");
  }

  // Update readAt timestamp
  await db
    .update(articles)
    .set({ readAt: new Date() })
    .where(eq(articles.id, articleId));
}

/**
 * Toggle article archive status
 * Returns the new archived status
 */
export async function toggleArticleArchive(
  articleId: string,
  userId: string
): Promise<boolean> {
  // Verify article exists and belongs to user
  const articlesList = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);

  if (articlesList.length === 0) {
    throw new Error("Article not found");
  }

  const article = articlesList[0];
  const newArchivedStatus = !article.archived;

  // Toggle archived status
  await db
    .update(articles)
    .set({ archived: newArchivedStatus })
    .where(eq(articles.id, articleId));

  return newArchivedStatus;
}

/**
 * Update article metadata
 */
export async function updateArticleMetadata(
  articleId: string,
  metadata: {
    title?: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
  }
): Promise<void> {
  await db.update(articles).set(metadata).where(eq(articles.id, articleId));
}
