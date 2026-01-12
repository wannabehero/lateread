import { beforeEach, describe, expect, it } from "bun:test";
import type { Hono } from "hono";
import { db, resetDatabase } from "../../test/bootstrap";
import {
  createAuthHeaders,
  createCompletedArticle,
  createTag,
  createUser,
  parseHtml,
} from "../../test/fixtures";
import { createApp } from "../app";
import { articleTags } from "../db/schema";
import type { AppContext } from "../types/context";

describe("routes/search", () => {
  let app: Hono<AppContext>;
  let testUserId: string;
  let authHeaders: HeadersInit;

  beforeEach(async () => {
    resetDatabase();

    // Create test user
    const user = await createUser(db);
    testUserId = user.id;

    // Create auth headers with valid session cookie
    authHeaders = createAuthHeaders(testUserId);

    // Create the actual production app with all middleware
    app = createApp();
  });

  describe("GET /search - Full Page", () => {
    it("should render search page with empty state when no query", async () => {
      const res = await app.request("/search", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      const doc = parseHtml(html);

      // Should have search form
      expect(doc.querySelector("form.search-form")).toBeTruthy();
      expect(doc.querySelector("#search-input")).toBeTruthy();

      // Should show empty state prompting to enter query
      expect(html).toContain("Enter a search query to find articles");

      // Should not show "no articles found" message
      expect(html).not.toContain("No articles found");
    });

    it("should render search page with results when query matches articles", async () => {
      // Create articles with specific content
      const _article1 = await createCompletedArticle(db, testUserId, {
        title: "Understanding TypeScript",
        description: "A guide to TypeScript",
      });
      const _article2 = await createCompletedArticle(db, testUserId, {
        title: "JavaScript Basics",
        description: "Learn JavaScript fundamentals",
      });
      await createCompletedArticle(db, testUserId, {
        title: "Python Tutorial",
        description: "Getting started with Python",
      });

      const res = await app.request("/search?q=typescript", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      const doc = parseHtml(html);

      // Should have search form with query value
      const searchInput = doc.querySelector(
        "#search-input",
      ) as HTMLInputElement;
      expect(searchInput?.value).toBe("typescript");

      // Should show results
      expect(html).toContain("Understanding TypeScript");
      expect(html).not.toContain("JavaScript Basics");
      expect(html).not.toContain("Python Tutorial");

      // Should not show empty state
      expect(html).not.toContain("Enter a search query");
      expect(html).not.toContain("No articles found");
    });

    it("should render search page with no results message when query has no matches", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "TypeScript Guide",
      });
      await createCompletedArticle(db, testUserId, {
        title: "JavaScript Tutorial",
      });

      const res = await app.request("/search?q=python", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();

      // Should show "no articles found" message with the query (HTML escaped)
      expect(html).toContain("No articles found for &quot;python&quot;");

      // Should not show articles
      expect(html).not.toContain("TypeScript Guide");
      expect(html).not.toContain("JavaScript Tutorial");
    });

    it("should search across title and description", async () => {
      // Create articles with different searchable fields
      const _article1 = await createCompletedArticle(db, testUserId, {
        title: "Web Development",
        description: "JavaScript frameworks",
      });

      const _article2 = await createCompletedArticle(db, testUserId, {
        title: "JavaScript Guide",
        description: "Learn programming",
      });

      const _article3 = await createCompletedArticle(db, testUserId, {
        title: "Python Tutorial",
        description: "Backend development",
      });

      const res = await app.request("/search?q=javascript", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();

      // Should find articles with "JavaScript" in title or description
      expect(html).toContain("Web Development");
      expect(html).toContain("JavaScript Guide");
      expect(html).not.toContain("Python Tutorial");
    });

    it("should be case insensitive", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "TypeScript Tutorial",
      });

      const res = await app.request("/search?q=TYPESCRIPT", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("TypeScript Tutorial");
    });

    it("should handle special characters in query", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "C++ Programming",
      });

      const res = await app.request("/search?q=C%2B%2B", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("C++ Programming");
    });

    it("should only return current user's articles", async () => {
      const otherUser = await createUser(db);

      // Current user's article
      await createCompletedArticle(db, testUserId, {
        title: "TypeScript Guide",
      });

      // Other user's article with same keyword
      await createCompletedArticle(db, otherUser.id, {
        title: "TypeScript Tutorial",
      });

      const res = await app.request("/search?q=typescript", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();

      // Should only show current user's article
      expect(html).toContain("TypeScript Guide");
      expect(html).not.toContain("TypeScript Tutorial");
    });

    it("should search across both active and archived articles", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "Active TypeScript Guide",
        archived: false,
      });

      await createCompletedArticle(db, testUserId, {
        title: "Archived TypeScript Tutorial",
        archived: true,
      });

      const res = await app.request("/search?q=typescript", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();

      // Search should include both archived and unarchived
      expect(html).toContain("Active TypeScript Guide");
      expect(html).toContain("Archived TypeScript Tutorial");
    });

    it("should handle empty query string", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "Some Article",
      });

      const res = await app.request("/search?q=", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();

      // Empty query should show the prompt, not results
      expect(html).toContain("Enter a search query to find articles");
      expect(html).not.toContain("Some Article");
    });

    it("should handle whitespace-only query", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "Some Article",
      });

      const res = await app.request("/search?q=+++", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();

      // Whitespace-only query gets trimmed to empty string, treated as no query
      expect(html).toContain("Enter a search query to find articles");
      expect(html).not.toContain("Some Article");
    });
  });

  describe("GET /search - HTMX Partial Response", () => {
    it("should return SearchResults partial when HTMX request", async () => {
      const _article = await createCompletedArticle(db, testUserId, {
        title: "TypeScript Guide",
      });

      const res = await app.request("/search?q=typescript", {
        headers: {
          ...authHeaders,
          "hx-request": "true",
          "hx-target": "search-results",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      const doc = parseHtml(html);

      // Should only contain the search-results div (partial)
      const searchResults = doc.querySelector("#search-results");
      expect(searchResults).toBeTruthy();

      // Should NOT contain the full page structure (form, h1, etc.)
      expect(doc.querySelector("form.search-form")).toBeNull();
      expect(doc.querySelector("h1")).toBeNull();

      // Should contain the article
      expect(html).toContain("TypeScript Guide");
    });

    it("should return full page when HTMX request without correct target", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "TypeScript Guide",
      });

      const res = await app.request("/search?q=typescript", {
        headers: {
          ...authHeaders,
          "hx-request": "true",
          // Missing hx-target or wrong target
        },
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      const doc = parseHtml(html);

      // Should contain full page structure
      expect(doc.querySelector("form.search-form")).toBeTruthy();
      expect(doc.querySelector("h1")).toBeTruthy();
      expect(doc.querySelector("#search-results")).toBeTruthy();
    });

    it("should return partial with no results message", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "JavaScript Guide",
      });

      const res = await app.request("/search?q=python", {
        headers: {
          ...authHeaders,
          "hx-request": "true",
          "hx-target": "search-results",
        },
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      const doc = parseHtml(html);

      // Should be partial
      expect(doc.querySelector("#search-results")).toBeTruthy();
      expect(doc.querySelector("form.search-form")).toBeNull();

      // Should show no results message (HTML escaped)
      expect(html).toContain("No articles found for &quot;python&quot;");
    });

    it("should return partial with empty state when no query", async () => {
      const res = await app.request("/search", {
        headers: {
          ...authHeaders,
          "hx-request": "true",
          "hx-target": "search-results",
        },
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      const doc = parseHtml(html);

      // Should be partial
      expect(doc.querySelector("#search-results")).toBeTruthy();

      // Should show empty state prompt
      expect(html).toContain("Enter a search query to find articles");
    });

    it("should handle HTMX request with results", async () => {
      const _article1 = await createCompletedArticle(db, testUserId, {
        title: "TypeScript Basics",
      });
      const _article2 = await createCompletedArticle(db, testUserId, {
        title: "Advanced TypeScript",
      });
      await createCompletedArticle(db, testUserId, {
        title: "JavaScript Guide",
      });

      const res = await app.request("/search?q=typescript", {
        headers: {
          ...authHeaders,
          "hx-request": "true",
          "hx-target": "search-results",
        },
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      const doc = parseHtml(html);

      // Should be partial
      expect(doc.querySelector("#search-results")).toBeTruthy();

      // Should show matching articles
      expect(html).toContain("TypeScript Basics");
      expect(html).toContain("Advanced TypeScript");
      expect(html).not.toContain("JavaScript Guide");

      // Should have article grid
      expect(doc.querySelector(".article-grid")).toBeTruthy();
    });
  });

  describe("Authentication", () => {
    it("should redirect to login when not authenticated", async () => {
      // Make request without auth headers
      const res = await app.request("/search");

      // requireAuth("redirect") redirects to "/login?back=..."
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/login?back=%2Fsearch");
    });

    it("should redirect for HTMX requests when not authenticated", async () => {
      // Make HTMX request without auth headers
      const res = await app.request("/search?q=test", {
        headers: {
          "hx-request": "true",
          "hx-target": "search-results",
        },
      });

      // requireAuth("redirect") redirects to login with back param
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/login?back=%2Fsearch");
    });
  });

  describe("Query Parameter Handling", () => {
    it("should preserve query parameter in URL", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "TypeScript Guide",
      });

      const res = await app.request("/search?q=typescript", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      const doc = parseHtml(html);

      // Search input should have the query value
      const searchInput = doc.querySelector(
        "#search-input",
      ) as HTMLInputElement;
      expect(searchInput?.value).toBe("typescript");
    });

    it("should handle multiple query parameters", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "TypeScript Guide",
      });

      // Extra parameters should be ignored
      const res = await app.request("/search?q=typescript&extra=param", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("TypeScript Guide");
    });

    it("should handle URL-encoded query", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "Web Development & Design",
      });

      const res = await app.request("/search?q=Web+Development+%26+Design", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("Web Development &amp; Design");
    });

    it("should trim query whitespace", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "TypeScript Guide",
      });

      const res = await app.request("/search?q=++typescript++", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("TypeScript Guide");
    });
  });

  describe("Integration with Article Service", () => {
    it("should find articles by title", async () => {
      const _article = await createCompletedArticle(db, testUserId, {
        title: "TypeScript Fundamentals",
        description: "Learn the basics",
      });

      const res = await app.request("/search?q=fundamentals", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("TypeScript Fundamentals");
    });

    it("should find articles by description", async () => {
      const _article = await createCompletedArticle(db, testUserId, {
        title: "Web Development",
        description: "Introduction to TypeScript",
      });

      const res = await app.request("/search?q=typescript", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("Web Development");
    });

    it("should include tags in query results", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        title: "TypeScript Guide",
        description: "Learn TypeScript basics",
      });

      const tag1 = await createTag(db, testUserId, "programming");
      const tag2 = await createTag(db, testUserId, "webdev");
      await db.insert(articleTags).values([
        { articleId: article.id, tagId: tag1.id },
        { articleId: article.id, tagId: tag2.id },
      ]);

      const res = await app.request("/search?q=typescript", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();

      // Should find the article (tags returned in data but not displayed in ArticleCard)
      expect(html).toContain("TypeScript Guide");
    });

    it("should handle partial word matches", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "TypeScript Programming",
      });

      const res = await app.request("/search?q=program", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("TypeScript Programming");
    });

    it("should find articles regardless of status (only completed shown)", async () => {
      // Only completed articles should be returned by getArticlesWithTags
      const _completed = await createCompletedArticle(db, testUserId, {
        title: "Completed TypeScript Guide",
      });

      const res = await app.request("/search?q=typescript", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();

      // Should show completed article
      expect(html).toContain("Completed TypeScript Guide");
    });
  });
});
