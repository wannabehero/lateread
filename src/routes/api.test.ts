import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { db, resetDatabase } from "../../test/bootstrap";
import {
  createArticle,
  createAuthHeaders,
  createCompletedArticle,
  createUser,
  parseHtml,
} from "../../test/fixtures";
import { createApp } from "../app";
import { articles } from "../db/schema";
import { encodeImageUrl } from "../lib/image-proxy";
import type { SummaryResult } from "../lib/llm";
import * as safeFetchModule from "../lib/safe-fetch";
import * as summariesService from "../services/summaries.service";
import type { AppContext } from "../types/context";

describe("routes/api", () => {
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

  describe("POST /api/articles/:id/read", () => {
    it("should mark article as read and return 204", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const res = await app.request(`/api/articles/${article.id}/read`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(204);

      // Verify database state
      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(updatedArticle?.readAt).not.toBeNull();
      expect(updatedArticle?.readAt).toBeInstanceOf(Date);
    });

    it("should return 404 when article does not exist", async () => {
      // Use a valid UUID that doesn't exist in the database
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const res = await app.request(`/api/articles/${nonExistentId}/read`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json).toEqual({
        error: "Article not found",
        statusCode: 404,
        context: {
          resource: "Article",
          id: nonExistentId,
        },
      });
    });

    it("should return 400 for invalid article ID format", async () => {
      const res = await app.request("/api/articles/invalid-id/read", {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.context.fields.errors.id).toBe("Invalid article ID format");
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      const res = await app.request(`/api/articles/${article.id}/read`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json).toEqual({
        error: "Article not found",
        statusCode: 404,
        context: {
          resource: "Article",
          id: article.id,
        },
      });

      // Verify article was NOT marked as read
      const [unchangedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(unchangedArticle?.readAt).toBeNull();
    });

    it("should handle already read article", async () => {
      const article = await createCompletedArticle(db, testUserId);

      // Mark as read first time
      await app.request(`/api/articles/${article.id}/read`, {
        headers: authHeaders,
        method: "POST",
      });

      // Mark as read second time
      const res = await app.request(`/api/articles/${article.id}/read`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(204);
    });
  });

  describe("DELETE /api/articles/:id", () => {
    it("should delete an article and redirect to articles list", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        title: "Article to Delete",
      });

      const res = await app.request(`/api/articles/${article.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("x-toast-message")).toBe("Article deleted");
      expect(res.headers.get("hx-location")).toBe("/articles");

      // Verify article is deleted from database
      const [deletedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(deletedArticle).toBeUndefined();
    });

    it("should return 404 when article does not exist", async () => {
      // Use a valid UUID that doesn't exist in the database
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const res = await app.request(`/api/articles/${nonExistentId}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      expect(res.status).toBe(404);
    });

    it("should return 400 for invalid article ID format on delete", async () => {
      const res = await app.request("/api/articles/invalid-id", {
        method: "DELETE",
        headers: authHeaders,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.context.fields.errors.id).toBe("Invalid article ID format");
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id, {
        title: "Other User Article",
      });

      const res = await app.request(`/api/articles/${article.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      expect(res.status).toBe(404);

      // Verify article still exists
      const [existingArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(existingArticle).toBeDefined();
    });

    it("should return 401 when not authenticated", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const res = await app.request(`/api/articles/${article.id}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(401);

      // Verify article still exists
      const [existingArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(existingArticle).toBeDefined();
    });
  });

  describe("POST /api/articles/:id/archive", () => {
    it("should archive article and return toast header", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        archived: false,
      });

      const res = await app.request(`/api/articles/${article.id}/archive`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("x-toast-message")).toBe("Article archived");

      // Verify database state
      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(updatedArticle?.archived).toBe(true);
    });

    it("should unarchive article when already archived", async () => {
      // First create an article
      const article = await createCompletedArticle(db, testUserId, {
        archived: false,
      });

      // Archive it first
      await app.request(`/api/articles/${article.id}/archive`, {
        headers: authHeaders,
        method: "POST",
      });

      // Now unarchive it
      const res = await app.request(`/api/articles/${article.id}/archive`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("x-toast-message")).toBe("Article unarchived");

      // Verify database state
      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(updatedArticle?.archived).toBe(false);
    });

    it("should redirect when redirect param is true", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const res = await app.request(
        `/api/articles/${article.id}/archive?redirect=true`,
        {
          headers: authHeaders,
          method: "POST",
        },
      );

      expect(res.status).toBe(204);
      expect(res.headers.get("hx-location")).toBe("/articles");
      expect(res.headers.get("hx-trigger")).toBe("scrollToTop");
    });

    it("should return EmptyState when no articles remain in current view", async () => {
      // Create only one unarchived article
      const article = await createCompletedArticle(db, testUserId);

      const res = await app.request(`/api/articles/${article.id}/archive`, {
        headers: authHeaders,
        method: "POST",
      });

      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);
      expect(doc.querySelector("#article-container")).toBeTruthy();
      expect(doc.querySelector('[hx-swap-oob="true"]')).toBeTruthy();
    });

    it("should not return EmptyState when other articles remain", async () => {
      const article1 = await createCompletedArticle(db, testUserId);
      await createCompletedArticle(db, testUserId); // Another unarchived article

      const res = await app.request(`/api/articles/${article1.id}/archive`, {
        headers: authHeaders,
        method: "POST",
      });

      const html = await res.text();

      expect(res.status).toBe(200);
      // Should be empty fragment, not EmptyState
      expect(html.trim()).toBe("");
    });

    it("should return 404 when article does not exist", async () => {
      // Use a valid UUID that doesn't exist in the database
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const res = await app.request(`/api/articles/${nonExistentId}/archive`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Article not found");
      expect(json.statusCode).toBe(404);
    });

    it("should return 400 for invalid article ID format on archive", async () => {
      const res = await app.request("/api/articles/invalid-id/archive", {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.context.fields.errors.id).toBe("Invalid article ID format");
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      const res = await app.request(`/api/articles/${article.id}/archive`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Article not found");
      expect(json.statusCode).toBe(404);
    });
  });

  describe("POST /api/articles/:id/rate", () => {
    it("should rate article as liked and archive it", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        archived: false,
      });

      const res = await app.request(
        `/api/articles/${article.id}/rate?rating=1`,
        {
          headers: authHeaders,
          method: "POST",
        },
      );

      expect(res.status).toBe(204);
      expect(res.headers.get("x-toast-message")).toBe("Article liked");
      expect(res.headers.get("hx-location")).toBe("/articles");
      expect(res.headers.get("hx-trigger")).toBe("scrollToTop");

      // Verify database state
      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(updatedArticle?.rating).toBe(1);
      expect(updatedArticle?.archived).toBe(true);
    });

    it("should rate article as disliked and archive it", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        archived: false,
      });

      const res = await app.request(
        `/api/articles/${article.id}/rate?rating=-1`,
        {
          headers: authHeaders,
          method: "POST",
        },
      );

      expect(res.status).toBe(204);
      expect(res.headers.get("x-toast-message")).toBe("Article disliked");
      expect(res.headers.get("hx-location")).toBe("/articles");
      expect(res.headers.get("hx-trigger")).toBe("scrollToTop");

      // Verify database state
      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(updatedArticle?.rating).toBe(-1);
      expect(updatedArticle?.archived).toBe(true);
    });

    it("should return 400 for missing rating param", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const res = await app.request(`/api/articles/${article.id}/rate`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
    });

    it("should return 400 for invalid rating value", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const res = await app.request(
        `/api/articles/${article.id}/rate?rating=5`,
        {
          headers: authHeaders,
          method: "POST",
        },
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.context.fields.errors.rating).toBe(
        "Rating must be '-1' or '1'",
      );
    });

    it("should return 404 when article does not exist", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const res = await app.request(
        `/api/articles/${nonExistentId}/rate?rating=1`,
        {
          headers: authHeaders,
          method: "POST",
        },
      );

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Article not found");
    });

    it("should return 400 for invalid article ID format", async () => {
      const res = await app.request("/api/articles/invalid-id/rate?rating=1", {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.context.fields.errors.id).toBe("Invalid article ID format");
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      const res = await app.request(
        `/api/articles/${article.id}/rate?rating=1`,
        {
          headers: authHeaders,
          method: "POST",
        },
      );

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Article not found");
    });

    it("should return 401 when not authenticated", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const res = await app.request(
        `/api/articles/${article.id}/rate?rating=1`,
        {
          method: "POST",
        },
      );

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/articles/:id/summarize", () => {
    let spyGetOrGenerateSummary: ReturnType<
      typeof spyOn<typeof summariesService, "getOrGenerateSummary">
    >;

    beforeEach(() => {
      spyGetOrGenerateSummary = spyOn(summariesService, "getOrGenerateSummary");
    });

    afterEach(() => {
      spyGetOrGenerateSummary.mockRestore();
    });

    it("should generate and return summary HTML", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        language: "en",
      });

      const mockSummary: SummaryResult = {
        oneSentence: "This is a one sentence summary.",
        oneParagraph: "This is a one paragraph summary with more details.",
        long: "This is a long summary with extensive information.",
      };

      spyGetOrGenerateSummary.mockResolvedValue(mockSummary);

      const res = await app.request(`/api/articles/${article.id}/summarize`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();

      // Verify SummaryView component renders
      expect(html).toContain(mockSummary.oneSentence);
      expect(html).toContain(mockSummary.oneParagraph);
      expect(html).toContain(mockSummary.long);

      // Verify service was called with correct params
      expect(spyGetOrGenerateSummary).toHaveBeenCalledWith(
        testUserId,
        article.id,
        article.url,
        article.language,
      );
    });

    it("should pass null language when article has no language", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        language: null,
      });

      const mockSummary: SummaryResult = {
        oneSentence: "Summary",
        oneParagraph: "Summary paragraph",
        long: "Long summary",
      };

      spyGetOrGenerateSummary.mockResolvedValue(mockSummary);

      await app.request(`/api/articles/${article.id}/summarize`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(spyGetOrGenerateSummary).toHaveBeenCalledWith(
        testUserId,
        article.id,
        article.url,
        null,
      );
    });

    it("should return 404 when article does not exist", async () => {
      spyGetOrGenerateSummary.mockResolvedValue({
        oneSentence: "Summary",
        oneParagraph: "Summary",
        long: "Summary",
      });

      // Use a valid UUID that doesn't exist in the database
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const res = await app.request(
        `/api/articles/${nonExistentId}/summarize`,
        {
          headers: authHeaders,
          method: "POST",
        },
      );

      expect(res.status).toBe(404);
      expect(spyGetOrGenerateSummary).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid article ID format on summarize", async () => {
      spyGetOrGenerateSummary.mockResolvedValue({
        oneSentence: "Summary",
        oneParagraph: "Summary",
        long: "Summary",
      });

      const res = await app.request("/api/articles/invalid-id/summarize", {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.context.fields.errors.id).toBe("Invalid article ID format");
      expect(spyGetOrGenerateSummary).not.toHaveBeenCalled();
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      spyGetOrGenerateSummary.mockResolvedValue({
        oneSentence: "Summary",
        oneParagraph: "Summary",
        long: "Summary",
      });

      const res = await app.request(`/api/articles/${article.id}/summarize`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(404);
      expect(spyGetOrGenerateSummary).not.toHaveBeenCalled();
    });

    it("should propagate errors from summary service", async () => {
      const article = await createCompletedArticle(db, testUserId);

      spyGetOrGenerateSummary.mockRejectedValue(
        new Error("LLM service unavailable"),
      );

      const res = await app.request(`/api/articles/${article.id}/summarize`, {
        headers: authHeaders,
        method: "POST",
      });

      // Error handler middleware should catch this
      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/articles/processing-count", () => {
    it("should return processing banner with correct count", async () => {
      // Create articles with different statuses - use createArticle for non-completed statuses
      await createArticle(db, testUserId, { status: "pending" });
      await createArticle(db, testUserId, { status: "processing" });
      await createCompletedArticle(db, testUserId); // status: "completed"
      await createArticle(db, testUserId, { status: "failed" });

      const res = await app.request("/api/articles/processing-count", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();

      // ProcessingBanner component should show count of 2 (pending + processing)
      expect(html).toContain("2 articles processing");
    });

    it("should return empty when no processing articles", async () => {
      await createCompletedArticle(db, testUserId); // status: "completed"
      await createArticle(db, testUserId, { status: "failed" });

      const res = await app.request("/api/articles/processing-count", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      // ProcessingBanner returns null when count is 0, which renders as empty
      expect(html).toBe("");
    });

    it("should only count current user's articles", async () => {
      const otherUser = await createUser(db);

      // Current user has 1 processing
      await createArticle(db, testUserId, { status: "pending" });

      // Other user has 2 processing
      await createArticle(db, otherUser.id, { status: "pending" });
      await createArticle(db, otherUser.id, { status: "processing" });

      const res = await app.request("/api/articles/processing-count", {
        headers: authHeaders,
      });

      const html = await res.text();
      expect(html).toContain("1 article processing");
    });

    it("should handle errors gracefully and return empty", async () => {
      // Create a spy that throws an error
      const spyCountArticlesByStatus = spyOn(
        await import("../services/articles.service"),
        "countArticlesByStatus",
      );
      spyCountArticlesByStatus.mockRejectedValue(new Error("Database error"));

      const res = await app.request("/api/articles/processing-count", {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const html = await res.text();
      // On error, returns ProcessingBanner with count 0, which renders as empty
      expect(html).toBe("");

      spyCountArticlesByStatus.mockRestore();
    });
  });

  describe("POST /api/preferences/reader", () => {
    it.each([
      ["sans", 16],
      ["serif", 18],
      ["new-york", 20],
    ])("should accept '%s' font family with size %i", async (fontFamily, fontSize) => {
      const formData = new FormData();
      formData.append("fontFamily", fontFamily);
      formData.append("fontSize", String(fontSize));

      const res = await app.request("/api/preferences/reader", {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true });

      // Verify database state
      const { users } = await import("../db/schema");
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, testUserId))
        .limit(1);

      const preferences = JSON.parse(user?.preferences || "{}");
      expect(preferences.reader).toEqual({
        fontFamily,
        fontSize,
      });
    });

    it.each([
      [
        "invalid-font",
        16,
        "fontFamily",
        "Font family must be 'sans', 'serif', or 'new-york'",
      ],
      ["sans", 13, "fontSize", "Font size must be at least 14"],
      ["sans", 25, "fontSize", "Font size must be at most 24"],
    ])("should return 400 for fontFamily=%s, fontSize=%i", async (fontFamily, fontSize, errorField, expectedError) => {
      const formData = new FormData();
      formData.append("fontFamily", fontFamily);
      formData.append("fontSize", String(fontSize));

      const res = await app.request("/api/preferences/reader", {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.statusCode).toBe(400);
      expect(json.context.fields.errors[errorField]).toBe(expectedError);
    });

    it.each([
      [14, "minimum"],
      [24, "maximum"],
    ])("should accept %s font size (%i)", async (fontSize) => {
      const formData = new FormData();
      formData.append("fontFamily", "sans");
      formData.append("fontSize", String(fontSize));

      const res = await app.request("/api/preferences/reader", {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true });
    });
  });

  describe("POST /api/articles/:id/position", () => {
    it("should save reading position and return 204", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const formData = new FormData();
      formData.append("element", "5");
      formData.append("offset", "30");

      const res = await app.request(`/api/articles/${article.id}/position`, {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(204);

      // Verify database state
      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(updatedArticle?.readingPositionElement).toBe(5);
      expect(updatedArticle?.readingPositionOffset).toBe(30);
    });

    it("should accept element=0 and offset=0", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const formData = new FormData();
      formData.append("element", "0");
      formData.append("offset", "0");

      const res = await app.request(`/api/articles/${article.id}/position`, {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(204);

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(updatedArticle?.readingPositionElement).toBe(0);
      expect(updatedArticle?.readingPositionOffset).toBe(0);
    });

    it("should accept offset=100 (end of element)", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const formData = new FormData();
      formData.append("element", "10");
      formData.append("offset", "100");

      const res = await app.request(`/api/articles/${article.id}/position`, {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(204);

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(updatedArticle?.readingPositionOffset).toBe(100);
    });

    it("should return 400 for negative element", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const formData = new FormData();
      formData.append("element", "-1");
      formData.append("offset", "50");

      const res = await app.request(`/api/articles/${article.id}/position`, {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
    });

    it("should return 400 for offset > 100", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const formData = new FormData();
      formData.append("element", "5");
      formData.append("offset", "101");

      const res = await app.request(`/api/articles/${article.id}/position`, {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
    });

    it("should return 400 for negative offset", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const formData = new FormData();
      formData.append("element", "5");
      formData.append("offset", "-10");

      const res = await app.request(`/api/articles/${article.id}/position`, {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
    });

    it("should return 404 when article does not exist", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const formData = new FormData();
      formData.append("element", "5");
      formData.append("offset", "30");

      const res = await app.request(`/api/articles/${nonExistentId}/position`, {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Article not found");
    });

    it("should return 400 for invalid article ID format", async () => {
      const formData = new FormData();
      formData.append("element", "5");
      formData.append("offset", "30");

      const res = await app.request("/api/articles/invalid-id/position", {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.context.fields.errors.id).toBe("Invalid article ID format");
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      const formData = new FormData();
      formData.append("element", "5");
      formData.append("offset", "30");

      const res = await app.request(`/api/articles/${article.id}/position`, {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(404);

      // Verify position was NOT updated
      const [unchangedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(unchangedArticle?.readingPositionElement).toBeNull();
      expect(unchangedArticle?.readingPositionOffset).toBeNull();
    });

    it("should return 401 when not authenticated", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const formData = new FormData();
      formData.append("element", "5");
      formData.append("offset", "30");

      const res = await app.request(`/api/articles/${article.id}/position`, {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(401);
    });

    it("should update existing position", async () => {
      const article = await createCompletedArticle(db, testUserId);

      // Set initial position
      const formData1 = new FormData();
      formData1.append("element", "5");
      formData1.append("offset", "30");

      await app.request(`/api/articles/${article.id}/position`, {
        headers: authHeaders,
        method: "POST",
        body: formData1,
      });

      // Update position
      const formData2 = new FormData();
      formData2.append("element", "10");
      formData2.append("offset", "75");

      const res = await app.request(`/api/articles/${article.id}/position`, {
        headers: authHeaders,
        method: "POST",
        body: formData2,
      });

      expect(res.status).toBe(204);

      const [updatedArticle] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id))
        .limit(1);

      expect(updatedArticle?.readingPositionElement).toBe(10);
      expect(updatedArticle?.readingPositionOffset).toBe(75);
    });
  });

  describe("Authentication", () => {
    it.each([
      ["POST", "/api/articles/some-id/read"],
      ["POST", "/api/articles/some-id/position"],
      ["DELETE", "/api/articles/some-id"],
      ["POST", "/api/articles/some-id/archive"],
      ["POST", "/api/articles/some-id/rate?rating=1"],
      ["POST", "/api/articles/some-id/summarize"],
      ["GET", "/api/articles/processing-count"],
      ["POST", "/api/preferences/reader"],
    ])("should return 401 for %s %s without auth", async (method, path) => {
      const options: RequestInit = { method };

      // Add form data for POST endpoints that require it
      if (path === "/api/preferences/reader") {
        const formData = new FormData();
        formData.append("fontFamily", "sans");
        formData.append("fontSize", "16");
        options.body = formData;
      } else if (path === "/api/articles/some-id/position") {
        const formData = new FormData();
        formData.append("element", "5");
        formData.append("offset", "30");
        options.body = formData;
      }

      const res = await app.request(path, options);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toEqual({
        error: "Unauthorized",
      });
    });
  });

  describe("Error Handler Integration", () => {
    it("should return JSON for API route errors (default)", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      // API routes return JSON by default due to /api/ path check
      const res = await app.request(`/api/articles/${article.id}/read`, {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");

      const json = await res.json();
      expect(json).toEqual({
        error: "Article not found",
        statusCode: 404,
        context: {
          resource: "Article",
          id: article.id,
        },
      });
    });

    it("should return HTMX partial for HTMX requests on API routes", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      // Make a request with HX-Request header
      const res = await app.request(`/api/articles/${article.id}/read`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "HX-Request": "true",
        },
      });

      // HTMX errors return 200 with error partial for proper swapping
      expect(res.status).toBe(200);
      expect(res.headers.get("hx-reswap")).toBe("outerHTML");
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      const doc = parseHtml(html);

      // Should contain error partial
      expect(doc.querySelector(".error-partial")).toBeTruthy();
      expect(html).toContain("Article not found");
    });

    it("should handle ValidationError with 400 status", async () => {
      const formData = new FormData();
      formData.append("fontFamily", "invalid");
      formData.append("fontSize", "16");

      const res = await app.request("/api/preferences/reader", {
        headers: authHeaders,
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.statusCode).toBe(400);
      expect(json.context).toBeDefined();
      expect(json.context.fields.errors.fontFamily).toBe(
        "Font family must be 'sans', 'serif', or 'new-york'",
      );
    });

    describe("InternalError handling", () => {
      let spyGetOrGenerateSummary: ReturnType<typeof spyOn>;

      beforeEach(() => {
        spyGetOrGenerateSummary = spyOn(
          summariesService,
          "getOrGenerateSummary",
        );
      });

      afterEach(() => {
        spyGetOrGenerateSummary.mockRestore();
      });

      it("should handle InternalError with 500 status", async () => {
        const article = await createCompletedArticle(db, testUserId);

        // Mock to throw an unexpected error
        spyGetOrGenerateSummary.mockRejectedValue(
          new Error("Unexpected database error"),
        );

        const res = await app.request(`/api/articles/${article.id}/summarize`, {
          headers: authHeaders,
          method: "POST",
        });

        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe("An unexpected error occurred");
        expect(json.statusCode).toBe(500);
      });
    });
  });

  describe("GET /api/image-proxy", () => {
    let spySafeFetch: ReturnType<typeof spyOn>;

    beforeEach(() => {
      spySafeFetch = spyOn(safeFetchModule, "safeFetch");
    });

    afterEach(() => {
      spySafeFetch.mockRestore();
    });

    const proxyUrl = (imageUrl: string) =>
      `/api/image-proxy?url=${encodeImageUrl(imageUrl)}`;

    it("should return 401 without auth", async () => {
      const res = await app.request(proxyUrl("https://example.com/img.jpg"));
      expect(res.status).toBe(401);
    });

    it("should return 400 when url param is missing", async () => {
      const res = await app.request("/api/image-proxy", {
        headers: authHeaders,
      });
      expect(res.status).toBe(400);
    });

    it("should proxy image and set cache headers", async () => {
      const imageBody = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      spySafeFetch.mockResolvedValue(
        new Response(imageBody, {
          headers: {
            "content-type": "image/png",
            "content-length": "4",
          },
        }),
      );

      const res = await app.request(proxyUrl("https://example.com/photo.png"), {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toBe("public, max-age=604800");
      expect(res.headers.get("content-length")).toBe("4");

      const body = new Uint8Array(await res.arrayBuffer());
      expect(body).toEqual(imageBody);
    });

    it("should return 503 when upstream returns non-ok", async () => {
      spySafeFetch.mockResolvedValue(
        new Response("Not Found", { status: 404 }),
      );

      const res = await app.request(
        proxyUrl("https://example.com/missing.jpg"),
        { headers: authHeaders },
      );

      expect(res.status).toBe(503);
    });

    it("should return 400 when upstream content-type is not an image", async () => {
      spySafeFetch.mockResolvedValue(
        new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        }),
      );

      const res = await app.request(proxyUrl("https://example.com/page.html"), {
        headers: authHeaders,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("URL does not point to an image");
    });

    it("should return 400 when content-length exceeds 10MB", async () => {
      spySafeFetch.mockResolvedValue(
        new Response(null, {
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(11 * 1024 * 1024),
          },
        }),
      );

      const res = await app.request(proxyUrl("https://example.com/huge.jpg"), {
        headers: authHeaders,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Image too large");
    });

    it("should pass through response without content-length", async () => {
      spySafeFetch.mockResolvedValue(
        new Response(new Uint8Array([0xff, 0xd8]), {
          headers: { "content-type": "image/jpeg" },
        }),
      );

      const res = await app.request(
        proxyUrl("https://example.com/streamed.jpg"),
        { headers: authHeaders },
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(res.headers.get("content-length")).toBeNull();
    });
  });
});
