import { beforeEach, describe, expect, it } from "bun:test";
import { db, resetDatabase } from "../../test/bootstrap";
import {
  addTagToArticle,
  createCompletedArticle,
  createTag,
  createUser,
} from "../../test/fixtures";
import * as schema from "../db/schema";
import {
  getArticleById,
  getArticlesWithTags,
  markArticleAsRead,
  toggleArticleArchive,
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

      const result = await getArticleById(article.id, user.id);

      expect(result.id).toBe(article.id);
      expect(result.title).toBe("Test Article");
      expect(result.tags).toHaveLength(1);
      expect(result.tags[0]?.name).toBe("test");
    });

    it("should throw error for non-existent article", async () => {
      const user = await createUser(db);

      let error: Error | null = null;
      try {
        await getArticleById("non-existent-id", user.id);
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
        await getArticleById(article.id, user2.id);
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

      const updated = await getArticleById(article.id, user.id);
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

      const updated = await getArticleById(article.id, user.id);
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

      const updated = await getArticleById(article.id, user.id);
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
});
