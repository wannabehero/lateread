import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
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
import type { SummaryResult } from "../lib/llm";
import * as llm from "../lib/llm";
import type { TTSProvider } from "../lib/tts";
import * as tts from "../lib/tts";
import * as contentService from "../services/content.service";
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
      const res = await app.request("/api/articles/non-existent-id/read", {
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
          id: "non-existent-id",
        },
      });
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
      const res = await app.request("/api/articles/non-existent-id/archive", {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Article not found");
      expect(json.statusCode).toBe(404);
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
      const doc = parseHtml(html);

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

      const res = await app.request("/api/articles/non-existent-id/summarize", {
        headers: authHeaders,
        method: "POST",
      });

      expect(res.status).toBe(404);
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

  describe("GET /api/articles/:id/tts", () => {
    let spyGetArticleContent: ReturnType<
      typeof spyOn<typeof contentService, "getArticleContent">
    >;
    let spyGetTTSProvider: ReturnType<
      typeof spyOn<typeof tts, "getTTSProvider">
    >;

    beforeEach(() => {
      spyGetArticleContent = spyOn(contentService, "getArticleContent");
      spyGetTTSProvider = spyOn(tts, "getTTSProvider");
    });

    afterEach(() => {
      spyGetArticleContent.mockRestore();
      spyGetTTSProvider.mockRestore();
    });

    it("should stream TTS audio with correct headers", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        language: "en",
      });

      const htmlContent = "<p>This is article content for TTS.</p>";
      spyGetArticleContent.mockResolvedValue(htmlContent);

      // Create a mock readable stream
      const mockAudioData = new Uint8Array([1, 2, 3, 4]);
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(mockAudioData);
          controller.close();
        },
      });

      const mockTTSProvider: TTSProvider = {
        generateStream: mock(() => Promise.resolve(mockStream)),
      };

      spyGetTTSProvider.mockReturnValue(mockTTSProvider);

      const res = await app.request(`/api/articles/${article.id}/tts`, {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("audio/mpeg");
      expect(res.headers.get("cache-control")).toBe("public, max-age=86400");

      // Verify content was fetched
      expect(spyGetArticleContent).toHaveBeenCalledWith(
        testUserId,
        article.id,
        article.url,
      );

      // Verify TTS provider was called with plain text and article language
      expect(mockTTSProvider.generateStream).toHaveBeenCalledWith(
        "This is article content for TTS.",
        "en",
      );

      // Verify stream contains data
      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    it("should strip HTML tags from content", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        language: "en",
      });

      const htmlContent = `
        <div>
          <h1>Title</h1>
          <p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p>
          <a href="#">Link</a>
        </div>
      `;
      spyGetArticleContent.mockResolvedValue(htmlContent);

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const mockTTSProvider: TTSProvider = {
        generateStream: mock(() => Promise.resolve(mockStream)),
      };

      spyGetTTSProvider.mockReturnValue(mockTTSProvider);

      await app.request(`/api/articles/${article.id}/tts`, {
        headers: authHeaders,
      });

      const calledWith = (mockTTSProvider.generateStream as any).mock
        .calls[0]?.[0];

      // Should not contain HTML tags
      expect(calledWith).not.toContain("<");
      expect(calledWith).not.toContain(">");
      expect(calledWith).toContain("Title");
      expect(calledWith).toContain("Paragraph");
      expect(calledWith).toContain("bold");
      expect(calledWith).toContain("italic");
    });

    it("should return 400 when content is empty after HTML stripping", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const htmlContent = "<div></div><p></p>";
      spyGetArticleContent.mockResolvedValue(htmlContent);

      const res = await app.request(`/api/articles/${article.id}/tts`, {
        headers: authHeaders,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({ error: "No content available for TTS" });

      // TTS provider should not be called
      expect(spyGetTTSProvider).not.toHaveBeenCalled();
    });

    it("should return 404 when article does not exist", async () => {
      const res = await app.request("/api/articles/non-existent-id/tts", {
        headers: authHeaders,
      });

      expect(res.status).toBe(404);
      expect(spyGetArticleContent).not.toHaveBeenCalled();
      expect(spyGetTTSProvider).not.toHaveBeenCalled();
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      const res = await app.request(`/api/articles/${article.id}/tts`, {
        headers: authHeaders,
      });

      expect(res.status).toBe(404);
      expect(spyGetArticleContent).not.toHaveBeenCalled();
      expect(spyGetTTSProvider).not.toHaveBeenCalled();
    });

    it("should pass article language to TTS provider", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        language: "es",
      });

      const htmlContent = "<p>Contenido en español</p>";
      spyGetArticleContent.mockResolvedValue(htmlContent);

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const mockTTSProvider: TTSProvider = {
        generateStream: mock(() => Promise.resolve(mockStream)),
      };

      spyGetTTSProvider.mockReturnValue(mockTTSProvider);

      await app.request(`/api/articles/${article.id}/tts`, {
        headers: authHeaders,
      });

      expect(mockTTSProvider.generateStream).toHaveBeenCalledWith(
        "Contenido en español",
        "es",
      );
    });

    it("should handle null language in article", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        language: null,
      });

      const htmlContent = "<p>Content</p>";
      spyGetArticleContent.mockResolvedValue(htmlContent);

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const mockTTSProvider: TTSProvider = {
        generateStream: mock(() => Promise.resolve(mockStream)),
      };

      spyGetTTSProvider.mockReturnValue(mockTTSProvider);

      await app.request(`/api/articles/${article.id}/tts`, {
        headers: authHeaders,
      });

      expect(mockTTSProvider.generateStream).toHaveBeenCalledWith(
        "Content",
        null,
      );
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
      ["invalid-font", 16, "Invalid font family"],
      ["sans", 13, "Font size must be between 14 and 24"],
      ["sans", 25, "Font size must be between 14 and 24"],
    ])("should return 400 for fontFamily=%s, fontSize=%i", async (fontFamily, fontSize, expectedError) => {
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
      expect(json.error).toBe(expectedError);
      expect(json.statusCode).toBe(400);
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

  describe("Authentication", () => {
    it.each([
      ["POST", "/api/articles/some-id/read"],
      ["POST", "/api/articles/some-id/archive"],
      ["POST", "/api/articles/some-id/summarize"],
      ["GET", "/api/articles/processing-count"],
      ["GET", "/api/articles/some-id/tts"],
      ["POST", "/api/preferences/reader"],
    ])("should return 401 for %s %s without auth", async (method, path) => {
      const options: RequestInit = { method };

      // Add form data for POST /api/preferences/reader
      if (path === "/api/preferences/reader") {
        const formData = new FormData();
        formData.append("fontFamily", "sans");
        formData.append("fontSize", "16");
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
      expect(json.error).toBe("Invalid font family");
      expect(json.statusCode).toBe(400);
      expect(json.context).toBeDefined();
    });

    it("should handle InternalError with 500 status", async () => {
      const article = await createCompletedArticle(db, testUserId);

      // Spy on getOrGenerateSummary to throw an unexpected error
      const spyGetOrGenerateSummary = spyOn(
        summariesService,
        "getOrGenerateSummary",
      );
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

      spyGetOrGenerateSummary.mockRestore();
    });
  });
});
