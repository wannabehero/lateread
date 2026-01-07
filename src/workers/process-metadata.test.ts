import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { db, resetDatabase } from "../../test/bootstrap";
import {
  createArticle,
  createNoopLogger,
  createTag,
  createUser,
} from "../../test/fixtures";
import { articleTags, articles, tags } from "../db/schema";
import { contentCache } from "../lib/content-cache";
import * as llm from "../lib/llm";
import * as readability from "../lib/readability";
import { processArticle } from "./process-metadata";

describe("process-metadata worker", () => {
  // Spies for external dependencies
  const spyContentCacheGet = spyOn(contentCache, "get");
  const spyContentCacheSet = spyOn(contentCache, "set");
  const spyContentCacheExists = spyOn(contentCache, "exists");
  const spyExtractCleanContent = spyOn(readability, "extractCleanContent");
  const spyGetLLMProvider = spyOn(llm, "getLLMProvider");

  // Mock LLM provider
  const mockExtractTags = mock(() =>
    Promise.resolve({
      tags: ["javascript", "testing"],
      language: "en",
      confidence: 0.95,
    })
  );

  const mockLLMProvider = {
    extractTags: mockExtractTags,
    summarize: mock(() => Promise.reject(new Error("Not implemented"))),
  };

  beforeEach(() => {
    resetDatabase();

    // Default mock implementations
    spyContentCacheGet.mockResolvedValue(null);
    spyContentCacheSet.mockResolvedValue();
    spyContentCacheExists.mockResolvedValue(false);
    spyGetLLMProvider.mockReturnValue(mockLLMProvider);
    spyExtractCleanContent.mockResolvedValue({
      title: "Test Article Title",
      content: "<p>Test article content</p>",
      textContent: "Test article content",
      description: "Test description",
      siteName: "Test Site",
      imageUrl: "https://example.com/image.jpg",
    });
    mockExtractTags.mockResolvedValue({
      tags: ["javascript", "testing"],
      language: "en",
      confidence: 0.95,
    });
  });

  afterEach(() => {
    spyContentCacheGet.mockReset();
    spyContentCacheSet.mockReset();
    spyContentCacheExists.mockReset();
    spyExtractCleanContent.mockReset();
    spyGetLLMProvider.mockReset();
    mockExtractTags.mockReset();
  });

  describe("content fetching", () => {
    it("should use cached content when available", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      spyContentCacheGet.mockResolvedValue("<p>Cached HTML content</p>");

      await processArticle(article, logger);

      expect(spyContentCacheGet).toHaveBeenCalledWith(user.id, article.id);
      expect(spyExtractCleanContent).not.toHaveBeenCalled();
    });

    it("should fetch and extract content when not cached", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, {
        status: "pending",
        url: "https://example.com/article",
      });
      const logger = createNoopLogger();

      spyContentCacheGet.mockResolvedValue(null);

      await processArticle(article, logger);

      expect(spyContentCacheGet).toHaveBeenCalledWith(user.id, article.id);
      expect(spyExtractCleanContent).toHaveBeenCalledWith(
        "https://example.com/article"
      );
    });

    it("should exit early when content extraction fails", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      spyContentCacheGet.mockResolvedValue(null);
      spyExtractCleanContent.mockResolvedValue({
        title: "Test",
        content: null,
        textContent: null,
      });

      await processArticle(article, logger);

      // Should not call LLM or update to completed
      expect(mockExtractTags).not.toHaveBeenCalled();

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));
      expect(updatedArticle?.status).not.toBe("completed");
    });
  });

  describe("content caching", () => {
    it("should cache content after extraction when not already cached", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      spyContentCacheGet.mockResolvedValue(null);
      spyContentCacheExists.mockResolvedValue(false);

      await processArticle(article, logger);

      expect(spyContentCacheSet).toHaveBeenCalledWith(
        user.id,
        article.id,
        "<p>Test article content</p>"
      );
    });

    it("should not cache content when already cached", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      spyContentCacheGet.mockResolvedValue(null);
      spyContentCacheExists.mockResolvedValue(true);

      await processArticle(article, logger);

      expect(spyContentCacheSet).not.toHaveBeenCalled();
    });
  });

  describe("LLM tag extraction", () => {
    it("should call LLM with text content and existing tags", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      await createTag(db, user.id, "existing-tag");
      const logger = createNoopLogger();

      await processArticle(article, logger);

      expect(mockExtractTags).toHaveBeenCalledWith("Test article content", [
        "existing-tag",
      ]);
    });

    it("should extract text from cached HTML for LLM", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      spyContentCacheGet.mockResolvedValue(
        "<p>Cached</p> <span>content</span> here"
      );

      await processArticle(article, logger);

      // Text extraction strips HTML tags and normalizes whitespace
      expect(mockExtractTags).toHaveBeenCalledWith(
        expect.stringContaining("Cached"),
        []
      );
    });
  });

  describe("tag creation", () => {
    it("should create tags for the correct user (bug fix verification)", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      mockExtractTags.mockResolvedValue({
        tags: ["new-tag"],
        language: "en",
        confidence: 0.95,
      });

      await processArticle(article, logger);

      // Verify tag was created for the correct user
      const [createdTag] = await db
        .select()
        .from(tags)
        .where(eq(tags.name, "new-tag"));

      expect(createdTag).toBeDefined();
      expect(createdTag?.userId).toBe(user.id);
    });

    it("should create multiple tags and associate them with article", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      mockExtractTags.mockResolvedValue({
        tags: ["tag-one", "tag-two", "tag-three"],
        language: "en",
        confidence: 0.95,
      });

      await processArticle(article, logger);

      // Verify all tags were created
      const createdTags = await db
        .select()
        .from(tags)
        .where(eq(tags.userId, user.id));

      expect(createdTags).toHaveLength(3);
      expect(createdTags.map((t) => t.name).sort()).toEqual([
        "tag-one",
        "tag-three",
        "tag-two",
      ]);

      // Verify tags are associated with article
      const associations = await db
        .select()
        .from(articleTags)
        .where(eq(articleTags.articleId, article.id));

      expect(associations).toHaveLength(3);
    });

    it("should reuse existing tags instead of creating duplicates", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const existingTag = await createTag(db, user.id, "existing-tag");
      const logger = createNoopLogger();

      mockExtractTags.mockResolvedValue({
        tags: ["existing-tag", "new-tag"],
        language: "en",
        confidence: 0.95,
      });

      await processArticle(article, logger);

      // Should only have 2 tags total (1 existing + 1 new)
      const allTags = await db
        .select()
        .from(tags)
        .where(eq(tags.userId, user.id));

      expect(allTags).toHaveLength(2);

      // Verify the existing tag ID is reused
      const associations = await db
        .select()
        .from(articleTags)
        .where(eq(articleTags.articleId, article.id));

      const tagIds = associations.map((a) => a.tagId);
      expect(tagIds).toContain(existingTag.id);
    });

    it("should normalize tags to lowercase", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      mockExtractTags.mockResolvedValue({
        tags: ["JavaScript", "TESTING", "BuN"],
        language: "en",
        confidence: 0.95,
      });

      await processArticle(article, logger);

      const createdTags = await db
        .select()
        .from(tags)
        .where(eq(tags.userId, user.id));

      expect(createdTags.map((t) => t.name).sort()).toEqual([
        "bun",
        "javascript",
        "testing",
      ]);
    });

    it("should not create tags for different users", async () => {
      const user1 = await createUser(db);
      const user2 = await createUser(db);
      const article = await createArticle(db, user1.id, { status: "pending" });
      const logger = createNoopLogger();

      mockExtractTags.mockResolvedValue({
        tags: ["user1-tag"],
        language: "en",
        confidence: 0.95,
      });

      await processArticle(article, logger);

      // Verify tag belongs to user1, not user2
      const user1Tags = await db
        .select()
        .from(tags)
        .where(eq(tags.userId, user1.id));
      const user2Tags = await db
        .select()
        .from(tags)
        .where(eq(tags.userId, user2.id));

      expect(user1Tags).toHaveLength(1);
      expect(user2Tags).toHaveLength(0);
    });
  });

  describe("article completion", () => {
    it("should update article status to completed", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      await processArticle(article, logger);

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updatedArticle?.status).toBe("completed");
    });

    it("should update article metadata from extracted content", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, {
        status: "pending",
        title: null,
        description: null,
      });
      const logger = createNoopLogger();

      spyExtractCleanContent.mockResolvedValue({
        title: "Extracted Title",
        content: "<p>Content</p>",
        textContent: "Content",
        description: "Extracted description",
        siteName: "Extracted Site",
        imageUrl: "https://example.com/extracted.jpg",
      });

      await processArticle(article, logger);

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updatedArticle?.title).toBe("Extracted Title");
      expect(updatedArticle?.description).toBe("Extracted description");
      expect(updatedArticle?.siteName).toBe("Extracted Site");
      expect(updatedArticle?.imageUrl).toBe("https://example.com/extracted.jpg");
    });

    it("should preserve existing metadata when using cached content", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, {
        status: "pending",
        title: "Original Title",
        description: "Original description",
        siteName: "Original Site",
        imageUrl: "https://example.com/original.jpg",
      });
      const logger = createNoopLogger();

      spyContentCacheGet.mockResolvedValue("<p>Cached content</p>");

      await processArticle(article, logger);

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updatedArticle?.title).toBe("Original Title");
      expect(updatedArticle?.description).toBe("Original description");
      expect(updatedArticle?.siteName).toBe("Original Site");
      expect(updatedArticle?.imageUrl).toBe("https://example.com/original.jpg");
    });

    it("should update article language from LLM response", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      mockExtractTags.mockResolvedValue({
        tags: ["tag"],
        language: "fr",
        confidence: 0.95,
      });

      await processArticle(article, logger);

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updatedArticle?.language).toBe("fr");
    });

    it("should set processedAt timestamp", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      await processArticle(article, logger);

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updatedArticle?.processedAt).toBeDefined();
      expect(updatedArticle?.processedAt).toBeInstanceOf(Date);
    });

    it("should clear lastError on successful completion", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, {
        status: "pending",
        lastError: "Previous error",
      });
      const logger = createNoopLogger();

      await processArticle(article, logger);

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updatedArticle?.lastError).toBeNull();
    });
  });

  describe("retry handling", () => {
    it("should clear existing article-tag associations on retry", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const oldTag = await createTag(db, user.id, "old-tag");
      const logger = createNoopLogger();

      // Add existing association (simulating previous failed attempt)
      await db.insert(articleTags).values({
        articleId: article.id,
        tagId: oldTag.id,
      });

      mockExtractTags.mockResolvedValue({
        tags: ["new-tag"],
        language: "en",
        confidence: 0.95,
      });

      await processArticle(article, logger);

      // Verify old association is removed and new one is added
      const associations = await db
        .select()
        .from(articleTags)
        .where(eq(articleTags.articleId, article.id));

      expect(associations).toHaveLength(1);
      expect(associations[0]?.tagId).not.toBe(oldTag.id);
    });
  });

  describe("edge cases", () => {
    it("should handle empty tags from LLM", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      mockExtractTags.mockResolvedValue({
        tags: [],
        language: "en",
        confidence: 0.95,
      });

      await processArticle(article, logger);

      // Article should still complete
      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updatedArticle?.status).toBe("completed");

      // No tags should be associated
      const associations = await db
        .select()
        .from(articleTags)
        .where(eq(articleTags.articleId, article.id));

      expect(associations).toHaveLength(0);
    });

    it("should handle null metadata fields gracefully", async () => {
      const user = await createUser(db);
      const article = await createArticle(db, user.id, { status: "pending" });
      const logger = createNoopLogger();

      spyExtractCleanContent.mockResolvedValue({
        title: "Title",
        content: "<p>Content</p>",
        textContent: "Content",
        // All optional fields undefined
      });

      await processArticle(article, logger);

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updatedArticle?.status).toBe("completed");
      expect(updatedArticle?.description).toBeNull();
      expect(updatedArticle?.siteName).toBeNull();
      expect(updatedArticle?.imageUrl).toBeNull();
    });
  });
});
