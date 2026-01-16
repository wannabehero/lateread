import type { SQL } from "drizzle-orm";
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { articleSummaries, articles, articleTags, tags } from "../db/schema";
import type { Article, ArticleStatus, Tag } from "../db/types";
import { db } from "../lib/db";
import { InternalError, NotFoundError } from "../lib/errors";
import { searchCachedArticleIds } from "./content.service";

type ArticleWithTags = Article & {
  tags: Tag[];
};

const DEFAULT_ARTICLES_LIMIT = 20;

export interface GetArticlesFilters {
  archived?: boolean;
  query?: string;
  cursor?: string;
  limit?: number;
}

export interface PaginatedArticles {
  articles: ArticleWithTags[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Build WHERE conditions for article queries
 * Handles: userId, status, archived, and search (database + cached content)
 */
async function buildArticleConditions(
  userId: string,
  filters: GetArticlesFilters = {},
): Promise<SQL[]> {
  const conditions: SQL[] = [
    eq(articles.userId, userId),
    eq(articles.status, "completed"),
  ];

  if (filters.archived !== undefined) {
    conditions.push(eq(articles.archived, filters.archived));
  }

  // If search query provided, search database, summaries, and cached content
  if (filters.query?.trim()) {
    const sanitizedQuery = escapeLikeString(filters.query.trim());
    const searchPattern = `%${sanitizedQuery}%`;
    const searchConditions: SQL[] = [];

    // Search database (title, description, and summaries)
    const dbSearchCondition = or(
      sql`${articles.title} LIKE ${searchPattern} ESCAPE '\\'`,
      sql`${articles.description} LIKE ${searchPattern} ESCAPE '\\'`,
      sql`${articleSummaries.oneSentence} LIKE ${searchPattern} ESCAPE '\\'`,
      sql`${articleSummaries.oneParagraph} LIKE ${searchPattern} ESCAPE '\\'`,
      sql`${articleSummaries.long} LIKE ${searchPattern} ESCAPE '\\'`,
    );
    if (dbSearchCondition) {
      searchConditions.push(dbSearchCondition);
    }

    // Search cached content using ripgrep (user-specific directory)
    const contentMatchIds = await searchCachedArticleIds(
      userId,
      filters.query.trim(),
    );
    if (contentMatchIds.length > 0) {
      searchConditions.push(inArray(articles.id, contentMatchIds));
    }

    // Combine: match database OR summaries OR cached content
    if (searchConditions.length > 0) {
      const combinedSearch = or(...searchConditions);
      if (combinedSearch) {
        conditions.push(combinedSearch);
      }
    }
  }

  return conditions;
}

/**
 * Parse cursor from string format "timestamp:id"
 */
function parseCursor(cursor: string): { createdAt: Date; id: string } | null {
  const parts = cursor.split(":");
  if (parts.length !== 2) return null;

  const timestamp = Number.parseInt(parts[0] ?? "", 10);
  const id = parts[1] ?? "";

  if (Number.isNaN(timestamp) || !id) return null;

  return {
    createdAt: new Date(timestamp * 1000),
    id,
  };
}

/**
 * Encode cursor to string format "timestamp:id"
 */
function encodeCursor(createdAt: Date, id: string): string {
  const timestamp = Math.floor(createdAt.getTime() / 1000);
  return `${timestamp}:${id}`;
}

/**
 * Get articles with tags for a user using JSON aggregation with cursor-based pagination
 */
export async function getArticlesWithTags(
  userId: string,
  filters: GetArticlesFilters = {},
): Promise<PaginatedArticles> {
  const limit = filters.limit ?? DEFAULT_ARTICLES_LIMIT;
  const conditions = await buildArticleConditions(userId, filters);

  // Add cursor condition for pagination
  if (filters.cursor) {
    const cursorData = parseCursor(filters.cursor);
    if (cursorData) {
      // For keyset pagination: WHERE (createdAt, id) < (cursor_createdAt, cursor_id)
      // This gives us stable pagination even if new articles are added
      conditions.push(
        or(
          lt(articles.createdAt, cursorData.createdAt),
          and(
            eq(articles.createdAt, cursorData.createdAt),
            lt(articles.id, cursorData.id),
          ),
        ) as SQL,
      );
    }
  }

  // Fetch limit + 1 to detect if there are more results
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
    .leftJoin(articleSummaries, eq(articles.id, articleSummaries.articleId))
    .where(and(...conditions))
    .groupBy(articles.id)
    .orderBy(
      filters.archived ? desc(articles.archivedAt) : desc(articles.createdAt),
      desc(articles.id),
    )
    .limit(limit + 1);

  const articlesWithTags = results.map((row) => ({
    ...row,
    tags: JSON.parse(row.tags).filter(
      (tag: { id: string; name: string } | null) => tag !== null,
    ),
  }));

  // Check if there are more results
  const hasMore = articlesWithTags.length > limit;
  const paginatedArticles = hasMore
    ? articlesWithTags.slice(0, limit)
    : articlesWithTags;

  // Generate next cursor from the last article
  let nextCursor: string | null = null;
  if (hasMore && paginatedArticles.length > 0) {
    const lastArticle = paginatedArticles[paginatedArticles.length - 1];
    if (lastArticle) {
      nextCursor = encodeCursor(lastArticle.createdAt, lastArticle.id);
    }
  }

  return {
    articles: paginatedArticles,
    nextCursor,
    hasMore,
  };
}

/**
 * Count articles for a user with filters
 */
export async function countArticles(
  userId: string,
  filters: GetArticlesFilters = {},
): Promise<number> {
  const conditions = await buildArticleConditions(userId, filters);

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .leftJoin(articleSummaries, eq(articles.id, articleSummaries.articleId))
    .where(and(...conditions));

  return result?.count ?? 0;
}

export async function getArticleById(id: string) {
  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);

  if (!article) {
    throw new NotFoundError("Article", id);
  }

  return article;
}

export async function updateArticleProcessing({
  id,
  status,
  lastError,
  processingAttempts,
}: {
  id: string;
  status: ArticleStatus;
  lastError?: string;
  processingAttempts?: number;
}) {
  await db
    .update(articles)
    .set({
      status,
      lastError,
      processingAttempts,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, id));
}

export async function updateArticleCompleted({
  id,
  tags,
  metadata,
  language,
  wordCount,
  readingTimeSeconds,
}: {
  id: string;
  tags: Tag[];
  metadata: Pick<Article, "title" | "description" | "imageUrl" | "siteName">;
  language: string;
  wordCount: number;
  readingTimeSeconds: number;
}) {
  await db.transaction(async (tx) => {
    await tx
      .update(articles)
      .set({
        title: metadata.title,
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        siteName: metadata.siteName,
        language: language,
        wordCount,
        readingTimeSeconds,
        status: "completed",
        processedAt: new Date(),
        updatedAt: new Date(),
        lastError: null,
      })
      .where(eq(articles.id, id));

    // Delete existing article-tag associations (in case of retry)
    await tx.delete(articleTags).where(eq(articleTags.articleId, id));

    if (tags.length > 0) {
      await tx.insert(articleTags).values(
        tags.map((tag) => ({
          articleId: id,
          tagId: tag.id,
        })),
      );
    }
  });
}

/**
 * Get a single article by ID with tags
 * Throws error if not found
 */
export async function getArticleWithTagsById(
  id: string,
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
    .where(and(eq(articles.id, id), eq(articles.userId, userId)))
    .groupBy(articles.id)
    .limit(1);

  if (!result) {
    throw new NotFoundError("Article", id);
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
    throw new NotFoundError("Article", articleId);
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
    throw new NotFoundError("Article", articleId);
  }

  const newArchivedStatus = !article.archived;

  // Toggle archived status
  await db
    .update(articles)
    .set({
      archived: newArchivedStatus,
      archivedAt: newArchivedStatus ? new Date() : null,
    })
    .where(eq(articles.id, articleId));

  return newArchivedStatus;
}

/**
 * Rate and archive an article
 */
export async function rateArticle(
  articleId: string,
  userId: string,
  rating: -1 | 1,
): Promise<void> {
  // Verify article exists and belongs to user
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);

  if (!article) {
    throw new NotFoundError("Article", articleId);
  }

  // Set rating and archive in one update
  await db
    .update(articles)
    .set({ rating, archived: true, archivedAt: new Date() })
    .where(eq(articles.id, articleId));
}

/**
 * Count articles by status for a user
 */
export async function countArticlesByStatus(
  userId: string,
  statuses: Array<"pending" | "processing" | "completed" | "failed" | "error">,
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(
      and(eq(articles.userId, userId), inArray(articles.status, statuses)),
    );

  return result?.count ?? 0;
}

/**
 * Create a new article
 */
export async function createArticle(params: {
  userId: string;
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
}): Promise<Article> {
  const [article] = await db
    .insert(articles)
    .values({
      userId: params.userId,
      url: params.url,
      title: params.title ?? null,
      description: params.description ?? null,
      siteName: params.siteName ?? null,
      imageUrl: params.imageUrl ?? null,
      status: "pending",
      processingAttempts: 0,
    })
    .returning();

  if (!article) {
    throw new InternalError("Failed to create article", {
      userId: params.userId,
      url: params.url,
    });
  }

  return article;
}

/**
 * Escapes special characters for LIKE clauses
 */
function escapeLikeString(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

/**
 * Update reading position for an article
 */
export async function updateReadingPosition(
  articleId: string,
  userId: string,
  position: { element: number; offset: number },
): Promise<void> {
  // Verify article exists and belongs to user
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);

  if (!article) {
    throw new NotFoundError("Article", articleId);
  }

  await db
    .update(articles)
    .set({
      readingPositionElement: position.element,
      readingPositionOffset: position.offset,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId));
}

/**
 * Delete an article
 * Returns true if the article was deleted
 */
export async function deleteArticle(
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
    throw new NotFoundError("Article", articleId);
  }

  // Delete the article (cascade will handle related records)
  await db.delete(articles).where(eq(articles.id, articleId));
}
