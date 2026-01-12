import { beforeEach, describe, expect, it } from "bun:test";
import type { Hono } from "hono";
import { db, resetDatabase } from "../../test/bootstrap";
import {
  createAuthHeaders,
  createCompletedArticle,
  createUser,
  parseHtml,
} from "../../test/fixtures";
import { createApp } from "../app";
import type { AppContext } from "../types/context";

describe("routes/home", () => {
  let app: Hono<AppContext>;
  let testUserId: string;
  let authHeaders: HeadersInit;

  beforeEach(async () => {
    resetDatabase();

    const user = await createUser(db);
    testUserId = user.id;
    authHeaders = createAuthHeaders(testUserId);

    app = createApp();
  });

  describe("GET / - Unauthenticated", () => {
    it("should redirect to login page when not authenticated", async () => {
      const res = await app.request("/");

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/login");
    });
  });

  describe("GET / - Authenticated", () => {
    it("should render article list when authenticated", async () => {
      const res = await app.request("/", { headers: authHeaders });

      expect(res.status).toBe(200);

      const html = await res.text();
      const doc = parseHtml(html);

      // Should show article container (empty state or list)
      expect(doc.querySelector("#article-container")).toBeTruthy();
    });

    it("should render articles when user has articles", async () => {
      await createCompletedArticle(db, testUserId, {
        title: "My Test Article",
      });

      const res = await app.request("/", { headers: authHeaders });

      expect(res.status).toBe(200);

      const html = await res.text();

      expect(html).toContain("My Test Article");
    });

    it("should render empty state when user has no articles", async () => {
      const res = await app.request("/", { headers: authHeaders });

      expect(res.status).toBe(200);

      const html = await res.text();
      const doc = parseHtml(html);

      expect(doc.querySelector(".empty-state")).toBeTruthy();
    });
  });
});
