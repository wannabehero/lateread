import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { articles, articleTags, db, tags } from "../lib/db";

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
 * Get articles with tags for a user using JSON aggregation
 */
export async function getArticlesWithTags(
  userId: string,
  filters: GetArticlesFilters = {},
): Promise<ArticleWithTags[]> {
  // Build WHERE conditions
  const conditions = [
    eq(articles.userId, userId),
    eq(articles.status, "completed"),
  ];

  if (filters.archived !== undefined) {
    conditions.push(eq(articles.archived, filters.archived));
  }

  // If filtering by tag, add tag conditions for efficient index usage
  // Tags are stored lowercase, so normalize the filter
  // Index: (userId, name) - both columns needed for optimal performance
  if (filters.tag) {
    const tagName = filters.tag.toLowerCase();
    conditions.push(eq(tags.userId, userId), eq(tags.name, tagName));
  }

  // Single unified query with COALESCE + CASE WHEN for all scenarios
  const results = await db
    .select({
      ...getTableColumns(articles),
      tags: sql<string>`COALESCE(json_group_array(
        CASE WHEN ${tags.id} IS NOT NULL
        THEN json_object('id', ${tags.id}, 'name', ${tags.name})
        END
      ), '[]')`,
    })
    .from(articles)
    .leftJoin(articleTags, eq(articles.id, articleTags.articleId))
    .leftJoin(tags, eq(articleTags.tagId, tags.id))
    .where(and(...conditions))
    .groupBy(articles.id)
    .orderBy(desc(articles.createdAt))
    .limit(50);

  return results.map((row) => ({
    ...row,
    tags: JSON.parse(row.tags).filter(
      (tag: { id: string; name: string } | null) => tag !== null,
    ),
  }));
}

/**
 * Get a single article by ID with tags
 * Throws error if not found
 */
export async function getArticleById(
  articleId: string,
  userId: string,
): Promise<ArticleWithTags> {
  const [result] = await db
    .select({
      ...getTableColumns(articles),
      tags: sql<string>`COALESCE(json_group_array(
        CASE WHEN ${tags.id} IS NOT NULL
        THEN json_object('id', ${tags.id}, 'name', ${tags.name})
        END
      ), '[]')`,
    })
    .from(articles)
    .leftJoin(articleTags, eq(articles.id, articleTags.articleId))
    .leftJoin(tags, eq(articleTags.tagId, tags.id))
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .groupBy(articles.id)
    .limit(1);

  if (!result) {
    throw new Error("Article not found");
  }

  return {
    ...result,
    tags: JSON.parse(result.tags).filter(
      (tag: { id: string; name: string } | null) => tag !== null,
    ),
  } as ArticleWithTags;
}

/**
 * Mark article as read
 */
export async function markArticleAsRead(
  articleId: string,
  userId: string,
): Promise<void> {
  // Verify article exists and belongs to user
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);

  if (!article) {
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
  userId: string,
): Promise<boolean> {
  // Verify article exists and belongs to user
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);

  if (!article) {
    throw new Error("Article not found");
  }

  const newArchivedStatus = !article.archived;

  // Toggle archived status
  await db
    .update(articles)
    .set({ archived: newArchivedStatus })
    .where(eq(articles.id, articleId));

  return newArchivedStatus;
}
