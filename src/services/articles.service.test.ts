import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db, resetDatabase } from "../../test/bootstrap";
import {
  addTagToArticle,
  createCompletedArticle,
  createTag,
  createUser,
} from "../../test/fixtures";
import * as schema from "../db/schema";
import { NotFoundError } from "../lib/errors";
import {
  countArticles,
  countArticlesByStatus,
  createArticle,
  getArticleById,
  getArticlesWithTags,
  getArticleWithTagsById,
  markArticleAsRead,
  toggleArticleArchive,
  updateArticleCompleted,
  updateArticleProcessing,
} from "./articles.service";

describe("articles.service", () => {
  beforeEach(() => {
    resetDatabase();
  });

  describe("getArticlesWithTags", () => {
    it("should return articles with tags for a user", async () => {
      const user = await createUser(db);

      const article = await createCompletedArticle(db, user.id, {
        title: "Test Article",
      });
      const tag = await createTag(db, user.id, "javascript");
      await addTagToArticle(db, article.id, tag.id);

      const articles = await getArticlesWithTags(user.id, {});

      expect(articles).toHaveLength(1);
      expect(articles[0]?.id).toBe(article.id);
      expect(articles[0]?.title).toBe("Test Article");
      expect(articles[0]?.tags).toHaveLength(1);
      expect(articles[0]?.tags[0]?.name).toBe("javascript");
    });

    it("should filter by archived status", async () => {
      const user = await createUser(db);
      await createCompletedArticle(db, user.id, {
        title: "Active Article",
      });

      const archivedArticle = await createCompletedArticle(db, user.id, {
        title: "Archived Article",
      });
      await toggleArticleArchive(archivedArticle.id, user.id);

      const activeArticles = await getArticlesWithTags(user.id, {
        archived: false,
      });
      expect(activeArticles).toHaveLength(1);
      expect(activeArticles[0]?.title).toBe("Active Article");

      const archivedArticles = await getArticlesWithTags(user.id, {
        archived: true,
      });
      expect(archivedArticles).toHaveLength(1);
      expect(archivedArticles[0]?.title).toBe("Archived Article");
    });

    it("should filter by tag", async () => {
      const user = await createUser(db);
      const article1 = await createCompletedArticle(db, user.id, {
        title: "Article 1",
      });
      const article2 = await createCompletedArticle(db, user.id, {
        title: "Article 2",
      });

      const jsTag = await createTag(db, user.id, "javascript");
      const pythonTag = await createTag(db, user.id, "python");

      await addTagToArticle(db, article1.id, jsTag.id);
      await addTagToArticle(db, article2.id, pythonTag.id);

      const jsArticles = await getArticlesWithTags(user.id, {
        tag: "javascript",
      });
      expect(jsArticles).toHaveLength(1);
      expect(jsArticles[0]?.title).toBe("Article 1");

      const pythonArticles = await getArticlesWithTags(user.id, {
        tag: "python",
      });
      expect(pythonArticles).toHaveLength(1);
      expect(pythonArticles[0]?.title).toBe("Article 2");
    });

    it("should only return completed articles", async () => {
      const user = await createUser(db);

      // Create pending article (won't be returned)
      await db.insert(schema.articles).values({
        userId: user.id,
        url: "https://example.com/pending",
        status: "pending",
      });

      // Create completed article (will be returned)
      await createCompletedArticle(db, user.id, {
        title: "Completed Article",
      });

      const articles = await getArticlesWithTags(user.id, {});
      expect(articles).toHaveLength(1);
      expect(articles[0]?.title).toBe("Completed Article");
    });

    it("should only return articles for the specified user", async () => {
      const user1 = await createUser(db);
      const user2 = await createUser(db);

      await createCompletedArticle(db, user1.id, {
        title: "User 1 Article",
      });
      await createCompletedArticle(db, user2.id, {
        title: "User 2 Article",
      });

      const user1Articles = await getArticlesWithTags(user1.id, {});
      expect(user1Articles).toHaveLength(1);
      expect(user1Articles[0]?.title).toBe("User 1 Article");

      const user2Articles = await getArticlesWithTags(user2.id, {});
      expect(user2Articles).toHaveLength(1);
      expect(user2Articles[0]?.title).toBe("User 2 Article");
    });
  });

  describe("getArticleById", () => {
    it("should return article with tags", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id, {
        title: "Test Article",
      });
      const tag = await createTag(db, user.id, "test");
      await addTagToArticle(db, article.id, tag.id);

      const result = await getArticleWithTagsById(article.id, user.id);

      expect(result.id).toBe(article.id);
      expect(result.title).toBe("Test Article");
      expect(result.tags).toHaveLength(1);
      expect(result.tags[0]?.name).toBe("test");
    });

    it("should throw error for non-existent article", async () => {
      const user = await createUser(db);

      let error: Error | null = null;
      try {
        await getArticleWithTagsById("non-existent-id", user.id);
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("not found");
    });

    it("should throw error for article belonging to different user", async () => {
      const user1 = await createUser(db);
      const user2 = await createUser(db);
      const article = await createCompletedArticle(db, user1.id);

      let error: Error | null = null;
      try {
        await getArticleWithTagsById(article.id, user2.id);
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("not found");
    });
  });

  describe("markArticleAsRead", () => {
    it("should set readAt timestamp", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      expect(article.readAt).toBeNull();

      await markArticleAsRead(article.id, user.id);

      const updated = await getArticleWithTagsById(article.id, user.id);
      expect(updated.readAt).not.toBeNull();
      expect(updated.readAt).toBeInstanceOf(Date);
    });

    it("should throw error for non-existent article", async () => {
      const user = await createUser(db);

      let error: Error | null = null;
      try {
        await markArticleAsRead("non-existent-id", user.id);
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("not found");
    });
  });

  describe("toggleArticleArchive", () => {
    it("should archive an active article", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      expect(article.archived).toBe(false);

      const newStatus = await toggleArticleArchive(article.id, user.id);
      expect(newStatus).toBe(true);

      const updated = await getArticleWithTagsById(article.id, user.id);
      expect(updated.archived).toBe(true);
    });

    it("should unarchive an archived article", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      // Archive it first
      const archivedStatus = await toggleArticleArchive(article.id, user.id);
      expect(archivedStatus).toBe(true);

      // Then unarchive
      const unarchivedStatus = await toggleArticleArchive(article.id, user.id);
      expect(unarchivedStatus).toBe(false);

      const updated = await getArticleWithTagsById(article.id, user.id);
      expect(updated.archived).toBe(false);
    });

    it("should throw error for non-existent article", async () => {
      const user = await createUser(db);

      let error: Error | null = null;
      try {
        await toggleArticleArchive("non-existent-id", user.id);
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("not found");
    });
  });

  describe("countArticles", () => {
    it("should count all completed articles for a user", async () => {
      const user = await createUser(db);
      await createCompletedArticle(db, user.id);
      await createCompletedArticle(db, user.id);
      await createCompletedArticle(db, user.id);

      const count = await countArticles(user.id, {});
      expect(count).toBe(3);
    });

    it("should count archived articles only", async () => {
      const user = await createUser(db);
      const article1 = await createCompletedArticle(db, user.id);
      await createCompletedArticle(db, user.id);
      const article3 = await createCompletedArticle(db, user.id);

      await toggleArticleArchive(article1.id, user.id);
      await toggleArticleArchive(article3.id, user.id);

      const archivedCount = await countArticles(user.id, { archived: true });
      expect(archivedCount).toBe(2);

      const activeCount = await countArticles(user.id, { archived: false });
      expect(activeCount).toBe(1);
    });

    it("should count articles by tag", async () => {
      const user = await createUser(db);
      const article1 = await createCompletedArticle(db, user.id);
      const article2 = await createCompletedArticle(db, user.id);
      const article3 = await createCompletedArticle(db, user.id);
      await createCompletedArticle(db, user.id); // Untagged article

      const jsTag = await createTag(db, user.id, "javascript");
      const pythonTag = await createTag(db, user.id, "python");

      await addTagToArticle(db, article1.id, jsTag.id);
      await addTagToArticle(db, article2.id, jsTag.id);
      await addTagToArticle(db, article3.id, pythonTag.id);

      const jsCount = await countArticles(user.id, { tag: "javascript" });
      expect(jsCount).toBe(2); // Should only count javascript-tagged articles

      const pythonCount = await countArticles(user.id, { tag: "python" });
      expect(pythonCount).toBe(1); // Should only count python-tagged article
    });

    it("should return 0 for user with no articles", async () => {
      const user = await createUser(db);
      const count = await countArticles(user.id, {});
      expect(count).toBe(0);
    });
  });

  describe("getArticleById", () => {
    it("should return article by id", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id, {
        title: "Test Article",
      });

      const result = await getArticleById(article.id);
      expect(result.id).toBe(article.id);
      expect(result.title).toBe("Test Article");
    });

    it("should throw NotFoundError for non-existent article", async () => {
      expect(async () => {
        await getArticleById("non-existent-id");
      }).toThrow(NotFoundError);
    });
  });

  describe("updateArticleProcessing", () => {
    it("should update article status and error info", async () => {
      const user = await createUser(db);
      const [article] = await db
        .insert(schema.articles)
        .values({
          userId: user.id,
          url: "https://example.com/test",
          status: "pending",
          processingAttempts: 0,
        })
        .returning();

      if (!article) throw new Error("Failed to create article");

      await updateArticleProcessing({
        id: article.id,
        status: "processing",
        processingAttempts: 1,
      });

      const updated = await getArticleById(article.id);
      expect(updated.status).toBe("processing");
      expect(updated.processingAttempts).toBe(1);
    });

    it("should update lastError when provided", async () => {
      const user = await createUser(db);
      const [article] = await db
        .insert(schema.articles)
        .values({
          userId: user.id,
          url: "https://example.com/test",
          status: "processing",
        })
        .returning();

      if (!article) throw new Error("Failed to create article");

      await updateArticleProcessing({
        id: article.id,
        status: "failed",
        lastError: "Network timeout",
        processingAttempts: 3,
      });

      const updated = await getArticleById(article.id);
      expect(updated.status).toBe("failed");
      expect(updated.lastError).toBe("Network timeout");
      expect(updated.processingAttempts).toBe(3);
    });
  });

  describe("updateArticleCompleted", () => {
    it("should update article with metadata and tags", async () => {
      const user = await createUser(db);
      const [article] = await db
        .insert(schema.articles)
        .values({
          userId: user.id,
          url: "https://example.com/article",
          status: "processing",
        })
        .returning();

      if (!article) throw new Error("Failed to create article");

      const tag1 = await createTag(db, user.id, "javascript");
      const tag2 = await createTag(db, user.id, "tutorial");

      await updateArticleCompleted({
        id: article.id,
        tags: [tag1, tag2],
        metadata: {
          title: "Complete Article",
          description: "A test article",
          imageUrl: "https://example.com/image.jpg",
          siteName: "Example Site",
        },
        language: "en",
      });

      const updated = await getArticleWithTagsById(article.id, user.id);
      expect(updated.status).toBe("completed");
      expect(updated.title).toBe("Complete Article");
      expect(updated.description).toBe("A test article");
      expect(updated.imageUrl).toBe("https://example.com/image.jpg");
      expect(updated.siteName).toBe("Example Site");
      expect(updated.language).toBe("en");
      expect(updated.processedAt).not.toBeNull();
      expect(updated.lastError).toBeNull();
      expect(updated.tags).toHaveLength(2);
    });

    it("should handle empty tags array", async () => {
      const user = await createUser(db);
      const [article] = await db
        .insert(schema.articles)
        .values({
          userId: user.id,
          url: "https://example.com/article",
          status: "processing",
        })
        .returning();

      if (!article) throw new Error("Failed to create article");

      await updateArticleCompleted({
        id: article.id,
        tags: [],
        metadata: {
          title: "No Tags Article",
          description: null,
          imageUrl: null,
          siteName: null,
        },
        language: "en",
      });

      const updated = await getArticleWithTagsById(article.id, user.id);
      expect(updated.status).toBe("completed");
      expect(updated.tags).toHaveLength(0);
    });

    it("should replace existing tags on retry", async () => {
      const user = await createUser(db);
      const [article] = await db
        .insert(schema.articles)
        .values({
          userId: user.id,
          url: "https://example.com/article",
          status: "processing",
        })
        .returning();

      if (!article) throw new Error("Failed to create article");

      const oldTag = await createTag(db, user.id, "oldtag");
      await addTagToArticle(db, article.id, oldTag.id);

      const newTag = await createTag(db, user.id, "newtag");

      await updateArticleCompleted({
        id: article.id,
        tags: [newTag],
        metadata: {
          title: "Updated Article",
          description: null,
          imageUrl: null,
          siteName: null,
        },
        language: "en",
      });

      const updated = await getArticleWithTagsById(article.id, user.id);
      expect(updated.tags).toHaveLength(1);
      expect(updated.tags[0]?.name).toBe("newtag");
    });
  });

  describe("countArticlesByStatus", () => {
    it("should count articles by single status", async () => {
      const user = await createUser(db);

      await db.insert(schema.articles).values([
        { userId: user.id, url: "https://example.com/1", status: "pending" },
        { userId: user.id, url: "https://example.com/2", status: "pending" },
        {
          userId: user.id,
          url: "https://example.com/3",
          status: "processing",
        },
      ]);

      const pendingCount = await countArticlesByStatus(user.id, ["pending"]);
      expect(pendingCount).toBe(2);

      const processingCount = await countArticlesByStatus(user.id, [
        "processing",
      ]);
      expect(processingCount).toBe(1);
    });

    it("should count articles by multiple statuses", async () => {
      const user = await createUser(db);

      await db.insert(schema.articles).values([
        { userId: user.id, url: "https://example.com/1", status: "pending" },
        {
          userId: user.id,
          url: "https://example.com/2",
          status: "processing",
        },
        { userId: user.id, url: "https://example.com/3", status: "failed" },
        { userId: user.id, url: "https://example.com/4", status: "completed" },
      ]);

      const count = await countArticlesByStatus(user.id, [
        "pending",
        "processing",
        "failed",
      ]);
      expect(count).toBe(3);
    });

    it("should only count articles for specified user", async () => {
      const user1 = await createUser(db);
      const user2 = await createUser(db);

      await db.insert(schema.articles).values([
        { userId: user1.id, url: "https://example.com/1", status: "pending" },
        { userId: user2.id, url: "https://example.com/2", status: "pending" },
      ]);

      const count = await countArticlesByStatus(user1.id, ["pending"]);
      expect(count).toBe(1);
    });

    it("should return 0 for no matching articles", async () => {
      const user = await createUser(db);
      const count = await countArticlesByStatus(user.id, ["completed"]);
      expect(count).toBe(0);
    });
  });

  describe("createArticle", () => {
    it("should create article with all fields", async () => {
      const user = await createUser(db);

      const article = await createArticle({
        userId: user.id,
        url: "https://example.com/article",
        title: "Test Article",
        description: "Test description",
        siteName: "Example",
        imageUrl: "https://example.com/image.jpg",
      });

      expect(article.id).toBeDefined();
      expect(article.userId).toBe(user.id);
      expect(article.url).toBe("https://example.com/article");
      expect(article.title).toBe("Test Article");
      expect(article.description).toBe("Test description");
      expect(article.siteName).toBe("Example");
      expect(article.imageUrl).toBe("https://example.com/image.jpg");
      expect(article.status).toBe("pending");
      expect(article.processingAttempts).toBe(0);
    });

    it("should create article with minimal fields", async () => {
      const user = await createUser(db);

      const article = await createArticle({
        userId: user.id,
        url: "https://example.com/article",
      });

      expect(article.id).toBeDefined();
      expect(article.userId).toBe(user.id);
      expect(article.url).toBe("https://example.com/article");
      expect(article.title).toBeNull();
      expect(article.description).toBeNull();
      expect(article.siteName).toBeNull();
      expect(article.imageUrl).toBeNull();
      expect(article.status).toBe("pending");
    });

    it("should create multiple articles with different URLs", async () => {
      const user = await createUser(db);

      const article1 = await createArticle({
        userId: user.id,
        url: "https://example.com/article1",
      });

      const article2 = await createArticle({
        userId: user.id,
        url: "https://example.com/article2",
      });

      expect(article1.id).not.toBe(article2.id);
      expect(article1.url).toBe("https://example.com/article1");
      expect(article2.url).toBe("https://example.com/article2");
    });
  });
});
