import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../lib/config";
import { contentCache } from "../lib/content-cache";
import { ExternalServiceError } from "../lib/errors";
import * as readability from "../lib/readability";
import { getArticleContent, searchCachedArticleIds } from "./content.service";

// Use real config.CACHE_DIR but with test-specific user ID to avoid conflicts
const TEST_USER_ID = `test-user-${crypto.randomUUID()}`;

describe("content.service", () => {
  describe("getArticleContent", () => {
    let spyGet: ReturnType<typeof spyOn<typeof contentCache, "get">>;
    let spySet: ReturnType<typeof spyOn<typeof contentCache, "set">>;
    let spyExtractCleanContent: ReturnType<
      typeof spyOn<typeof readability, "extractCleanContent">
    >;

    beforeEach(() => {
      spyGet = spyOn(contentCache, "get");
      spySet = spyOn(contentCache, "set");
      spyExtractCleanContent = spyOn(readability, "extractCleanContent");
    });

    afterEach(() => {
      spyGet.mockRestore();
      spySet.mockRestore();
      spyExtractCleanContent.mockRestore();
    });

    it("should return cached content when available", async () => {
      const userId = randomUUID();
      const articleId = randomUUID();
      const articleUrl = "https://example.com/article";
      const cachedContent = "<p>Cached article content</p>";

      spyGet.mockResolvedValue(cachedContent);
      spySet.mockResolvedValue();

      const result = await getArticleContent(userId, articleId, articleUrl);

      expect(result).toBe(cachedContent);
      expect(spyGet).toHaveBeenCalledWith(userId, articleId);
      expect(spyExtractCleanContent).not.toHaveBeenCalled();
      expect(spySet).not.toHaveBeenCalled();
    });

    it("should fetch and cache content on cache miss", async () => {
      const userId = randomUUID();
      const articleId = randomUUID();
      const articleUrl = "https://example.com/article";
      const extractedContent = "<p>Extracted article content</p>";

      spyGet.mockResolvedValue(null);
      spySet.mockResolvedValue();
      spyExtractCleanContent.mockResolvedValue({
        title: "Test Article",
        content: extractedContent,
        textContent: "Extracted article content",
        excerpt: "Test excerpt",
      });

      const result = await getArticleContent(userId, articleId, articleUrl);

      expect(result).toBe(extractedContent);
      expect(spyGet).toHaveBeenCalledWith(userId, articleId);
      expect(spyExtractCleanContent).toHaveBeenCalledWith(articleUrl);
      expect(spySet).toHaveBeenCalledWith(userId, articleId, extractedContent);
    });

    it("should throw ExternalServiceError when extraction returns no content", async () => {
      const userId = randomUUID();
      const articleId = randomUUID();
      const articleUrl = "https://example.com/article";

      spyGet.mockResolvedValue(null);
      spySet.mockResolvedValue();
      spyExtractCleanContent.mockResolvedValue({
        title: "Test Article",
        content: null,
      });

      await expect(
        getArticleContent(userId, articleId, articleUrl),
      ).rejects.toThrow(ExternalServiceError);

      expect(spyGet).toHaveBeenCalledWith(userId, articleId);
      expect(spyExtractCleanContent).toHaveBeenCalledWith(articleUrl);
      expect(spySet).not.toHaveBeenCalled();
    });

    it("should throw ExternalServiceError when extraction returns undefined content", async () => {
      const userId = randomUUID();
      const articleId = randomUUID();
      const articleUrl = "https://example.com/article";

      spyGet.mockResolvedValue(null);
      spySet.mockResolvedValue();
      spyExtractCleanContent.mockResolvedValue({
        title: "Test Article",
        content: undefined,
      });

      await expect(
        getArticleContent(userId, articleId, articleUrl),
      ).rejects.toThrow(ExternalServiceError);

      expect(spyGet).toHaveBeenCalledWith(userId, articleId);
      expect(spyExtractCleanContent).toHaveBeenCalledWith(articleUrl);
      expect(spySet).not.toHaveBeenCalled();
    });

    it("should propagate errors from extractCleanContent", async () => {
      const userId = randomUUID();
      const articleId = randomUUID();
      const articleUrl = "https://example.com/article";
      const extractionError = new Error("Failed to fetch article");

      spyGet.mockResolvedValue(null);
      spySet.mockResolvedValue();
      spyExtractCleanContent.mockRejectedValue(extractionError);

      await expect(
        getArticleContent(userId, articleId, articleUrl),
      ).rejects.toThrow(extractionError);

      expect(spyGet).toHaveBeenCalledWith(userId, articleId);
      expect(spyExtractCleanContent).toHaveBeenCalledWith(articleUrl);
      expect(spySet).not.toHaveBeenCalled();
    });

    it("should throw ExternalServiceError when extraction returns empty string", async () => {
      const userId = randomUUID();
      const articleId = randomUUID();
      const articleUrl = "https://example.com/article";

      spyGet.mockResolvedValue(null);
      spySet.mockResolvedValue();
      spyExtractCleanContent.mockResolvedValue({
        title: "Test Article",
        content: "", // Empty string is falsy
      });

      await expect(
        getArticleContent(userId, articleId, articleUrl),
      ).rejects.toThrow(ExternalServiceError);

      expect(spyGet).toHaveBeenCalledWith(userId, articleId);
      expect(spyExtractCleanContent).toHaveBeenCalledWith(articleUrl);
      expect(spySet).not.toHaveBeenCalled();
    });
  });

  describe("searchCachedArticleIds", () => {
    afterEach(async () => {
      // Clean up test user cache directories
      const testUserPatterns = [
        TEST_USER_ID,
        "user-1", // from "should only search within user's own cache directory" test
        "user-2", // from "should only search within user's own cache directory" test
      ];

      for (const userId of testUserPatterns) {
        try {
          await rm(join(config.CACHE_DIR, userId), {
            recursive: true,
            force: true,
          });
        } catch {
          // Ignore if doesn't exist
        }
      }
    });

    it("should find articles matching search query", async () => {
      const article1Id = randomUUID();
      const article2Id = randomUUID();
      const article3Id = randomUUID();

      // Create cache directory (uses real config.CACHE_DIR)
      const userCacheDir = join(config.CACHE_DIR, TEST_USER_ID);
      await mkdir(userCacheDir, { recursive: true });

      // Create test articles
      await Bun.write(
        join(userCacheDir, `${article1Id}.html`),
        "<html><body><p>JavaScript programming tutorial</p></body></html>",
      );

      await Bun.write(
        join(userCacheDir, `${article2Id}.html`),
        "<html><body><p>Python programming guide</p></body></html>",
      );

      await Bun.write(
        join(userCacheDir, `${article3Id}.html`),
        "<html><body><p>JavaScript frameworks comparison</p></body></html>",
      );

      const results = await searchCachedArticleIds(TEST_USER_ID, "JavaScript");

      expect(results).toHaveLength(2);
      expect(results).toContain(article1Id);
      expect(results).toContain(article3Id);
      expect(results).not.toContain(article2Id);
    });

    it("should be case-insensitive", async () => {
      const articleId = randomUUID();

      const userCacheDir = join(config.CACHE_DIR, TEST_USER_ID);
      await mkdir(userCacheDir, { recursive: true });

      await Bun.write(
        join(userCacheDir, `${articleId}.html`),
        "<html><body><p>TypeScript programming</p></body></html>",
      );

      const results1 = await searchCachedArticleIds(TEST_USER_ID, "typescript");
      const results2 = await searchCachedArticleIds(TEST_USER_ID, "TYPESCRIPT");
      const results3 = await searchCachedArticleIds(TEST_USER_ID, "TypeScript");

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
      expect(results3).toHaveLength(1);
      expect(results1[0]).toBe(articleId);
      expect(results2[0]).toBe(articleId);
      expect(results3[0]).toBe(articleId);
    });

    it("should return empty array if no matches found", async () => {
      const articleId = randomUUID();

      const userCacheDir = join(config.CACHE_DIR, TEST_USER_ID);
      await mkdir(userCacheDir, { recursive: true });

      await Bun.write(
        join(userCacheDir, `${articleId}.html`),
        "<html><body><p>JavaScript programming</p></body></html>",
      );

      const results = await searchCachedArticleIds(TEST_USER_ID, "Python");

      expect(results).toHaveLength(0);
    });

    it("should return empty array if cache directory does not exist", async () => {
      const results = await searchCachedArticleIds(
        "non-existent-user",
        "search-query",
      );

      expect(results).toHaveLength(0);
    });

    it("should return empty array if cache directory is empty", async () => {
      const userCacheDir = join(config.CACHE_DIR, TEST_USER_ID);
      await mkdir(userCacheDir, { recursive: true });

      const results = await searchCachedArticleIds(TEST_USER_ID, "JavaScript");

      expect(results).toHaveLength(0);
    });

    it("should only search within user's own cache directory", async () => {
      const user1Id = "user-1";
      const user2Id = "user-2";
      const article1Id = randomUUID();
      const article2Id = randomUUID();

      // Create cache for user 1
      const user1CacheDir = join(config.CACHE_DIR, user1Id);
      await mkdir(user1CacheDir, { recursive: true });
      await Bun.write(
        join(user1CacheDir, `${article1Id}.html`),
        "<html><body><p>JavaScript for user 1</p></body></html>",
      );

      // Create cache for user 2
      const user2CacheDir = join(config.CACHE_DIR, user2Id);
      await mkdir(user2CacheDir, { recursive: true });
      await Bun.write(
        join(user2CacheDir, `${article2Id}.html`),
        "<html><body><p>JavaScript for user 2</p></body></html>",
      );

      const user1Results = await searchCachedArticleIds(user1Id, "JavaScript");
      const user2Results = await searchCachedArticleIds(user2Id, "JavaScript");

      expect(user1Results).toHaveLength(1);
      expect(user1Results[0]).toBe(article1Id);

      expect(user2Results).toHaveLength(1);
      expect(user2Results[0]).toBe(article2Id);
    });

    it("should extract article IDs from file paths correctly", async () => {
      const articleId = "550e8400-e29b-41d4-a716-446655440000"; // Valid UUID

      const userCacheDir = join(config.CACHE_DIR, TEST_USER_ID);
      await mkdir(userCacheDir, { recursive: true });

      await Bun.write(
        join(userCacheDir, `${articleId}.html`),
        "<html><body><p>Test content</p></body></html>",
      );

      const results = await searchCachedArticleIds(TEST_USER_ID, "Test");

      expect(results).toHaveLength(1);
      expect(results[0]).toBe(articleId);
    });

    it("should handle search queries starting with hyphen", async () => {
      const articleId = randomUUID();

      const userCacheDir = join(config.CACHE_DIR, TEST_USER_ID);
      await mkdir(userCacheDir, { recursive: true });

      await Bun.write(
        join(userCacheDir, `${articleId}.html`),
        "<html><body><p>-v option</p></body></html>",
      );

      // Search for "-v"
      // If not handled correctly, ripgrep might treat it as a flag
      const results = await searchCachedArticleIds(TEST_USER_ID, "-v");

      expect(results).toHaveLength(1);
      expect(results[0]).toBe(articleId);
    });

    it("should handle search queries with special characters", async () => {
      const articleId = randomUUID();

      const userCacheDir = join(config.CACHE_DIR, TEST_USER_ID);
      await mkdir(userCacheDir, { recursive: true });

      await Bun.write(
        join(userCacheDir, `${articleId}.html`),
        "<html><body><p>C++ programming language</p></body></html>",
      );

      const results = await searchCachedArticleIds(TEST_USER_ID, "C++");

      expect(results).toHaveLength(1);
      expect(results[0]).toBe(articleId);
    });

    it("should return multiple results when multiple articles match", async () => {
      const article1Id = randomUUID();
      const article2Id = randomUUID();
      const article3Id = randomUUID();
      const article4Id = randomUUID();

      const userCacheDir = join(config.CACHE_DIR, TEST_USER_ID);
      await mkdir(userCacheDir, { recursive: true });

      await Bun.write(
        join(userCacheDir, `${article1Id}.html`),
        "<html><body><p>Machine learning tutorial</p></body></html>",
      );

      await Bun.write(
        join(userCacheDir, `${article2Id}.html`),
        "<html><body><p>Deep learning fundamentals</p></body></html>",
      );

      await Bun.write(
        join(userCacheDir, `${article3Id}.html`),
        "<html><body><p>Reinforcement learning guide</p></body></html>",
      );

      await Bun.write(
        join(userCacheDir, `${article4Id}.html`),
        "<html><body><p>Web development basics</p></body></html>",
      );

      const results = await searchCachedArticleIds(TEST_USER_ID, "learning");

      expect(results).toHaveLength(3);
      expect(results).toContain(article1Id);
      expect(results).toContain(article2Id);
      expect(results).toContain(article3Id);
      expect(results).not.toContain(article4Id);
    });

    it("should treat regex characters as literals", async () => {
      const articleId = randomUUID();

      const userCacheDir = join(config.CACHE_DIR, TEST_USER_ID);
      await mkdir(userCacheDir, { recursive: true });

      await Bun.write(
        join(userCacheDir, `${articleId}.html`),
        "<html><body><p>domain.com</p></body></html>",
      );

      // Search for "domain.com"
      // If . was treated as wildcard, it would match "domain-com" too
      // But we want literal match
      const results = await searchCachedArticleIds(TEST_USER_ID, "domain.com");

      expect(results).toHaveLength(1);
      expect(results[0]).toBe(articleId);
    });
  });
});
