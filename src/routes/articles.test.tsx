import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { Hono } from "hono";
import { db, resetDatabase } from "../../test/bootstrap";
import {
  addTagToArticle,
  createArticle,
  createAuthHeaders,
  createCompletedArticle,
  createSubscription,
  createTag,
  createUser,
  parseHtml,
} from "../../test/fixtures";
import { createApp } from "../app";
import * as llm from "../lib/llm";
import * as tts from "../lib/tts";
import * as contentService from "../services/content.service";
import type { AppContext } from "../types/context";

describe("routes/articles", () => {
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

  describe("GET /articles", () => {
    it("should render empty state when no articles exist", async () => {
      const res = await app.request("/articles", { headers: authHeaders });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      // Check for article container and empty state
      expect(doc.querySelector("#article-container")).toBeTruthy();
      expect(doc.querySelector(".empty-state")).toBeTruthy();
    });

    it("should render article list with completed articles", async () => {
      const article1 = await createCompletedArticle(db, testUserId, {
        title: "Test Article 1",
      });
      const article2 = await createCompletedArticle(db, testUserId, {
        title: "Test Article 2",
      });

      const res = await app.request("/articles", { headers: authHeaders });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Should not show empty state
      expect(doc.querySelector(".empty-state")).toBeNull();

      // Should show article grid
      expect(doc.querySelector(".article-grid")).toBeTruthy();

      // Should contain both articles
      expect(html).toContain("Test Article 1");
      expect(html).toContain("Test Article 2");
    });

    it("should filter archived articles when status=archived", async () => {
      const activeArticle = await createCompletedArticle(db, testUserId, {
        title: "Active Article",
        archived: false,
      });
      const archivedArticle = await createCompletedArticle(db, testUserId, {
        title: "Archived Article",
        archived: true,
      });

      const res = await app.request("/articles?status=archived", {
        headers: authHeaders,
      });
      const html = await res.text();

      expect(res.status).toBe(200);

      // Should show only archived article
      expect(html).toContain("Archived Article");
      expect(html).not.toContain("Active Article");
    });

    it("should show only active articles by default", async () => {
      const activeArticle = await createCompletedArticle(db, testUserId, {
        title: "Active Article",
        archived: false,
      });
      const archivedArticle = await createCompletedArticle(db, testUserId, {
        title: "Archived Article",
        archived: true,
      });

      const res = await app.request("/articles", { headers: authHeaders });
      const html = await res.text();

      expect(res.status).toBe(200);

      // Should show only active article
      expect(html).toContain("Active Article");
      expect(html).not.toContain("Archived Article");
    });

    it("should filter articles by tag", async () => {
      const tag1 = await createTag(db, testUserId, "technology");
      const tag2 = await createTag(db, testUserId, "science");

      const article1 = await createCompletedArticle(db, testUserId, {
        title: "Tech Article",
      });
      const article2 = await createCompletedArticle(db, testUserId, {
        title: "Science Article",
      });

      await addTagToArticle(db, article1.id, tag1.id);
      await addTagToArticle(db, article2.id, tag2.id);

      const res = await app.request("/articles?tag=technology", {
        headers: authHeaders,
      });
      const html = await res.text();

      expect(res.status).toBe(200);

      // Should show only tech article
      expect(html).toContain("Tech Article");
      expect(html).not.toContain("Science Article");
    });

    it("should display processing count for pending and processing articles", async () => {
      await createArticle(db, testUserId, { status: "pending" });
      await createArticle(db, testUserId, { status: "processing" });
      await createCompletedArticle(db, testUserId); // completed
      await createArticle(db, testUserId, { status: "failed" });

      const res = await app.request("/articles", { headers: authHeaders });
      const html = await res.text();

      expect(res.status).toBe(200);

      // Should show processing count of 2
      expect(html).toContain("2 articles processing");
    });

    it("should not display processing banner for archived view", async () => {
      await createArticle(db, testUserId, { status: "pending" });
      await createCompletedArticle(db, testUserId, { archived: true });

      const res = await app.request("/articles?status=archived", {
        headers: authHeaders,
      });
      const html = await res.text();

      expect(res.status).toBe(200);

      // Should not show processing banner
      expect(html).not.toContain("articles processing");
    });

    it("should not show other users' articles", async () => {
      const otherUser = await createUser(db);

      await createCompletedArticle(db, testUserId, {
        title: "My Article",
      });
      await createCompletedArticle(db, otherUser.id, {
        title: "Other User Article",
      });

      const res = await app.request("/articles", { headers: authHeaders });
      const html = await res.text();

      expect(res.status).toBe(200);

      // Should show only current user's article
      expect(html).toContain("My Article");
      expect(html).not.toContain("Other User Article");
    });

    it("should render full HTML page with layout", async () => {
      const res = await app.request("/articles", { headers: authHeaders });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Should have full HTML structure
      expect(doc.querySelector("html")).toBeTruthy();
      expect(doc.querySelector("head")).toBeTruthy();
      expect(doc.querySelector("body")).toBeTruthy();
      expect(doc.querySelector("title")?.textContent).toBe("lateread");

      // Should have navigation header
      expect(doc.querySelector("header.fixed-nav")).toBeTruthy();
    });

    it("should show articles with their tags", async () => {
      const tag = await createTag(db, testUserId, "technology");
      const article = await createCompletedArticle(db, testUserId, {
        title: "Tagged Article",
      });
      await addTagToArticle(db, article.id, tag.id);

      const res = await app.request("/articles", { headers: authHeaders });
      const html = await res.text();

      expect(res.status).toBe(200);

      // Should show article (tags are not displayed in list view, only in reader view)
      expect(html).toContain("Tagged Article");
    });
  });

  describe("GET /articles/:id", () => {
    let spyGetArticleContent: ReturnType<
      typeof spyOn<typeof contentService, "getArticleContent">
    >;

    beforeEach(() => {
      spyGetArticleContent = spyOn(contentService, "getArticleContent");
    });

    afterEach(() => {
      spyGetArticleContent.mockRestore();
    });

    it("should render article reader view with content", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        title: "Test Article",
        siteName: "Example Site",
      });

      const htmlContent = "<p>Article content here</p>";
      spyGetArticleContent.mockResolvedValue(htmlContent);

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      // Verify getArticleContent was called
      expect(spyGetArticleContent).toHaveBeenCalledWith(
        testUserId,
        article.id,
        article.url,
      );

      // Check for reader view structure
      expect(doc.querySelector(".reader-view")).toBeTruthy();
      expect(doc.querySelector(".reader-header")).toBeTruthy();
      expect(doc.querySelector(".reader-content")).toBeTruthy();

      // Check article details
      expect(html).toContain("Test Article");
      expect(html).toContain("Example Site");
      expect(html).toContain("Article content here");
    });

    it("should display article URL as title when title is null", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        title: null,
      });

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();

      expect(res.status).toBe(200);

      // Should show URL as fallback title
      expect(html).toContain(article.url);
    });

    it("should display article tags in reader view", async () => {
      const tag1 = await createTag(db, testUserId, "technology");
      const tag2 = await createTag(db, testUserId, "programming");

      const article = await createCompletedArticle(db, testUserId, {
        title: "Tagged Article",
      });

      await addTagToArticle(db, article.id, tag1.id);
      await addTagToArticle(db, article.id, tag2.id);

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Check for tags
      expect(doc.querySelector(".reader-tags")).toBeTruthy();
      expect(html).toContain("technology");
      expect(html).toContain("programming");
    });

    it("should show summary feature when LLM is available and user has subscription", async () => {
      const article = await createCompletedArticle(db, testUserId);
      await createSubscription(db, testUserId, { type: "full" });

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      // Mock LLM availability
      const spyIsLLMAvailable = spyOn(llm, "isLLMAvailable");
      spyIsLLMAvailable.mockReturnValue(true);

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Check for summary section
      expect(doc.querySelector(".reader-summary")).toBeTruthy();
      expect(html).toContain("Summary");
      expect(html).toContain(`/api/articles/${article.id}/summarize`);

      spyIsLLMAvailable.mockRestore();
    });

    it("should show TTS feature when TTS is available and user has subscription", async () => {
      const article = await createCompletedArticle(db, testUserId);
      await createSubscription(db, testUserId, { type: "full" });

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      // Mock TTS availability
      const spyIsTTSAvailable = spyOn(tts, "isTTSAvailable");
      spyIsTTSAvailable.mockReturnValue(true);

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Check for audio player
      expect(doc.querySelector(".reader-audio")).toBeTruthy();
      expect(doc.querySelector("audio")?.getAttribute("src")).toBe(
        `/api/articles/${article.id}/tts`,
      );

      spyIsTTSAvailable.mockRestore();
    });

    it("should not show summary when LLM is unavailable", async () => {
      const article = await createCompletedArticle(db, testUserId);
      await createSubscription(db, testUserId, { type: "full" });

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      // Mock LLM unavailability
      const spyIsLLMAvailable = spyOn(llm, "isLLMAvailable");
      spyIsLLMAvailable.mockReturnValue(false);

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Should not show summary section
      expect(doc.querySelector(".reader-summary")).toBeNull();

      spyIsLLMAvailable.mockRestore();
    });

    it("should not show TTS when user has no subscription", async () => {
      const article = await createCompletedArticle(db, testUserId);

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      // Mock TTS availability
      const spyIsTTSAvailable = spyOn(tts, "isTTSAvailable");
      spyIsTTSAvailable.mockReturnValue(true);

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Should not show audio player
      expect(doc.querySelector(".reader-audio")).toBeNull();

      spyIsTTSAvailable.mockRestore();
    });

    it("should show like and dislike buttons for unarchived articles", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        archived: false,
      });

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Check for like and dislike buttons
      expect(doc.querySelector(".reader-actions")).toBeTruthy();
      const likeButton = doc.querySelector('button[title="Like"]');
      const dislikeButton = doc.querySelector('button[title="Dislike"]');

      expect(likeButton).toBeTruthy();
      expect(likeButton?.getAttribute("hx-post")).toBe(
        `/api/articles/${article.id}/rate?rating=1`,
      );

      expect(dislikeButton).toBeTruthy();
      expect(dislikeButton?.getAttribute("hx-post")).toBe(
        `/api/articles/${article.id}/rate?rating=-1`,
      );
    });

    it("should not show like and dislike buttons for archived articles", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        archived: true,
      });

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Check that like and dislike buttons are not present
      const likeButton = doc.querySelector('button[title="Like"]');
      const dislikeButton = doc.querySelector('button[title="Dislike"]');

      expect(likeButton).toBeNull();
      expect(dislikeButton).toBeNull();
    });

    it("should show delete button in reader view", async () => {
      const article = await createCompletedArticle(db, testUserId);

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Check for delete button
      const deleteButton = doc.querySelector(".delete-button");
      expect(deleteButton).toBeTruthy();
      expect(deleteButton?.getAttribute("hx-delete")).toBe(
        `/api/articles/${article.id}`,
      );
      expect(deleteButton?.getAttribute("hx-confirm")).toBeTruthy();
      expect(html).toContain("trash-2.svg");
    });

    it("should mark article as read when footer intersects", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        readAt: null,
      });

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Check for intersection trigger on footer
      const footer = doc.querySelector(".reader-footer");
      expect(footer?.getAttribute("hx-post")).toBe(
        `/api/articles/${article.id}/read`,
      );
      expect(footer?.getAttribute("hx-trigger")).toBe("intersect once");
    });

    it("should not add read trigger when article is already read", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        readAt: new Date(),
      });

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Should not have read trigger
      const footer = doc.querySelector(".reader-footer");
      expect(footer?.getAttribute("hx-post")).toBeNull();
    });

    it("should return 404 when article does not exist", async () => {
      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      // Use a valid UUID that doesn't exist in the database
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const res = await app.request(`/articles/${nonExistentId}`, {
        headers: authHeaders,
      });

      expect(res.status).toBe(404);

      // Should not call getArticleContent
      expect(spyGetArticleContent).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid article ID format", async () => {
      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request("/articles/invalid-id", {
        headers: authHeaders,
      });

      expect(res.status).toBe(400);

      // Page routes return HTML error pages, not JSON
      const html = await res.text();
      const doc = parseHtml(html);

      expect(doc.querySelector(".error-page")).toBeTruthy();
      expect(html).toContain("Validation failed");

      // Should not call getArticleContent
      expect(spyGetArticleContent).not.toHaveBeenCalled();
    });

    it("should return 404 when article belongs to different user", async () => {
      const otherUser = await createUser(db);
      const article = await createCompletedArticle(db, otherUser.id);

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });

      expect(res.status).toBe(404);

      // Should not call getArticleContent
      expect(spyGetArticleContent).not.toHaveBeenCalled();
    });

    it("should include reader settings controls", async () => {
      const article = await createCompletedArticle(db, testUserId);

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Check for reader settings menu
      expect(doc.querySelector(".reader-settings-menu")).toBeTruthy();
      expect(doc.querySelector(".reader-settings-dropdown")).toBeTruthy();
    });

    it("should have collapsible header for reader view", async () => {
      const article = await createCompletedArticle(db, testUserId);

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Check for collapsible header
      const header = doc.querySelector("header.fixed-nav");
      expect(header?.getAttribute("data-collapsible")).toBe("true");
    });

    it("should render full HTML page with layout", async () => {
      const article = await createCompletedArticle(db, testUserId);

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Should have full HTML structure
      expect(doc.querySelector("html")).toBeTruthy();
      expect(doc.querySelector("head")).toBeTruthy();
      expect(doc.querySelector("body")).toBeTruthy();
      expect(doc.querySelector("title")?.textContent).toBe("lateread");
    });

    it("should show View Original link", async () => {
      const article = await createCompletedArticle(db, testUserId, {
        url: "https://example.com/original-article",
      });

      spyGetArticleContent.mockResolvedValue("<p>Content</p>");

      const res = await app.request(`/articles/${article.id}`, {
        headers: authHeaders,
      });
      const html = await res.text();
      const doc = parseHtml(html);

      expect(res.status).toBe(200);

      // Check for View Original link
      const link = doc.querySelector(
        'a[href="https://example.com/original-article"]',
      );
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain("View Original");
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    });
  });

  describe("Authentication", () => {
    it("should redirect to home when accessing /articles without auth", async () => {
      const res = await app.request("/articles");

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
    });

    it("should redirect to home when accessing /articles/:id without auth", async () => {
      const res = await app.request("/articles/some-id");

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
    });
  });
});
