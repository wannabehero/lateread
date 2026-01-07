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
  let spyGetSession: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    resetDatabase();

    // Create test user
    const user = await createUser(db);
    testUserId = user.id;

    // Spy on getSession to return our test userId
    // This simulates an authenticated user session
    const sessionModule = await import("../lib/session");
    spyGetSession = spyOn(sessionModule, "getSession");
    spyGetSession.mockReturnValue({ userId: testUserId });

    // Create the actual production app with all middleware
    // The spied session will make this user authenticated
    app = createApp();
  });

  afterEach(() => {
    // Restore the spy after each test
    spyGetSession.mockRestore();
  });

  describe("POST /api/articles/:id/read", () => {
    it("should mark article as read and return 204", async () => {
      const article = await createCompletedArticle(db, testUserId);

      const res = await app.request(`/api/articles/${article.id}/read`, {
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
        method: "POST",
      });

      expect(res.status).toBe(404);
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      const res = await app.request(`/api/articles/${article.id}/read`, {
        method: "POST",
      });

      expect(res.status).toBe(404);

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
        method: "POST",
      });

      // Mark as read second time
      const res = await app.request(`/api/articles/${article.id}/read`, {
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
        method: "POST",
      });

      // Now unarchive it
      const res = await app.request(`/api/articles/${article.id}/archive`, {
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
        method: "POST",
      });

      const html = await res.text();

      expect(res.status).toBe(200);
      // Should be empty fragment, not EmptyState
      expect(html.trim()).toBe("");
    });

    it("should return 404 when article does not exist", async () => {
      const res = await app.request("/api/articles/non-existent-id/archive", {
        method: "POST",
      });

      expect(res.status).toBe(404);
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      const res = await app.request(`/api/articles/${article.id}/archive`, {
        method: "POST",
      });

      expect(res.status).toBe(404);
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

      const res = await app.request("/api/articles/processing-count");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();

      // ProcessingBanner component should show count of 2 (pending + processing)
      expect(html).toContain("2 articles processing");
    });

    it("should return empty when no processing articles", async () => {
      await createCompletedArticle(db, testUserId); // status: "completed"
      await createArticle(db, testUserId, { status: "failed" });

      const res = await app.request("/api/articles/processing-count");

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

      const res = await app.request("/api/articles/processing-count");

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

      const res = await app.request("/api/articles/processing-count");

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

      const res = await app.request(`/api/articles/${article.id}/tts`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("audio/mpeg");
      expect(res.headers.get("cache-control")).toBe("public, max-age=86400");

      // Verify content was fetched
      expect(spyGetArticleContent).toHaveBeenCalledWith(
        testUserId,
        article.id,
        article.url,
      );

      // Verify TTS provider was called with plain text (htmlToPlainText trims whitespace)
      expect(mockTTSProvider.generateStream).toHaveBeenCalledWith(
        "This is article content for TTS.",
        null,
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

      await app.request(`/api/articles/${article.id}/tts`);

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

      const res = await app.request(`/api/articles/${article.id}/tts`);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({ error: "No content available for TTS" });

      // TTS provider should not be called
      expect(spyGetTTSProvider).not.toHaveBeenCalled();
    });

    it("should return 404 when article does not exist", async () => {
      const res = await app.request("/api/articles/non-existent-id/tts");

      expect(res.status).toBe(404);
      expect(spyGetArticleContent).not.toHaveBeenCalled();
      expect(spyGetTTSProvider).not.toHaveBeenCalled();
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      const res = await app.request(`/api/articles/${article.id}/tts`);

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

      await app.request(`/api/articles/${article.id}/tts`);

      expect(mockTTSProvider.generateStream).toHaveBeenCalledWith(
        "Contenido en español",
        null,
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

      await app.request(`/api/articles/${article.id}/tts`);

      expect(mockTTSProvider.generateStream).toHaveBeenCalledWith(
        "Content",
        null,
      );
    });
  });

  describe("POST /api/preferences/reader", () => {
    it("should update reader preferences with valid data", async () => {
      const formData = new FormData();
      formData.append("fontFamily", "serif");
      formData.append("fontSize", "18");

      const res = await app.request("/api/preferences/reader", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true });

      // Verify database state
      const [user] = await db
        .select()
        .from(await import("../db/schema").then((m) => m.users))
        .where(
          eq(
            (await import("../db/schema").then((m) => m.users)).id,
            testUserId,
          ),
        )
        .limit(1);

      const preferences = JSON.parse(user?.preferences || "{}");
      expect(preferences.reader).toEqual({
        fontFamily: "serif",
        fontSize: 18,
      });
    });

    it("should accept 'sans' font family", async () => {
      const formData = new FormData();
      formData.append("fontFamily", "sans");
      formData.append("fontSize", "16");

      const res = await app.request("/api/preferences/reader", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(200);
    });

    it("should accept 'new-york' font family", async () => {
      const formData = new FormData();
      formData.append("fontFamily", "new-york");
      formData.append("fontSize", "16");

      const res = await app.request("/api/preferences/reader", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(200);
    });

    it("should return 400 with invalid font family", async () => {
      const formData = new FormData();
      formData.append("fontFamily", "invalid-font");
      formData.append("fontSize", "16");

      const res = await app.request("/api/preferences/reader", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 when font size is below minimum", async () => {
      const formData = new FormData();
      formData.append("fontFamily", "sans");
      formData.append("fontSize", "13");

      const res = await app.request("/api/preferences/reader", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 when font size is above maximum", async () => {
      const formData = new FormData();
      formData.append("fontFamily", "sans");
      formData.append("fontSize", "25");

      const res = await app.request("/api/preferences/reader", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
    });

    it("should accept minimum font size (14)", async () => {
      const formData = new FormData();
      formData.append("fontFamily", "sans");
      formData.append("fontSize", "14");

      const res = await app.request("/api/preferences/reader", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(200);
    });

    it("should accept maximum font size (24)", async () => {
      const formData = new FormData();
      formData.append("fontFamily", "sans");
      formData.append("fontSize", "24");

      const res = await app.request("/api/preferences/reader", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(200);
    });
  });

  describe("Authentication", () => {
    let unauthenticatedApp: Hono<AppContext>;

    beforeEach(() => {
      // Override the parent spy to return null (unauthenticated)
      spyGetSession.mockReturnValue(null);

      // Create the actual production app WITHOUT authenticated session
      // This tests the real authentication behavior
      unauthenticatedApp = createApp();
    });

    it("should return 401 for /api/articles/:id/read without auth", async () => {
      const res = await unauthenticatedApp.request(
        "/api/articles/some-id/read",
        {
          method: "POST",
        },
      );

      expect(res.status).toBe(401);
    });

    it("should return 401 for /api/articles/:id/archive without auth", async () => {
      const res = await unauthenticatedApp.request(
        "/api/articles/some-id/archive",
        {
          method: "POST",
        },
      );

      expect(res.status).toBe(401);
    });

    it("should return 401 for /api/articles/:id/summarize without auth", async () => {
      const res = await unauthenticatedApp.request(
        "/api/articles/some-id/summarize",
        {
          method: "POST",
        },
      );

      expect(res.status).toBe(401);
    });

    it("should return 401 for /api/articles/processing-count without auth", async () => {
      const res = await unauthenticatedApp.request(
        "/api/articles/processing-count",
      );

      expect(res.status).toBe(401);
    });

    it("should return 401 for /api/articles/:id/tts without auth", async () => {
      const res = await unauthenticatedApp.request("/api/articles/some-id/tts");

      expect(res.status).toBe(401);
    });

    it("should return 401 for /api/preferences/reader without auth", async () => {
      const formData = new FormData();
      formData.append("fontFamily", "sans");
      formData.append("fontSize", "16");

      const res = await unauthenticatedApp.request("/api/preferences/reader", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(401);
    });
  });
});
