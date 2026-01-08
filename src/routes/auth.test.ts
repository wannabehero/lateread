import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
  spyOn,
} from "bun:test";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { db, resetDatabase } from "../../test/bootstrap";
import { createTelegramUser, createUser, parseHtml } from "../../test/fixtures";
import { createApp } from "../app";
import { authTokens } from "../db/schema";
import { config } from "../lib/config";
import * as authService from "../services/auth.service";
import type { AppContext } from "../types/context";

describe("routes/auth", () => {
  let app: Hono<AppContext>;

  // Fix the current time for consistent testing
  const NOW = new Date("2024-06-15T12:00:00Z");

  beforeEach(() => {
    setSystemTime(NOW);
    resetDatabase();
    app = createApp();
  });

  describe("POST /auth/telegram", () => {
    it("should create auth token with proper HTMX fragment and database record", async () => {
      const res = await app.request("/auth/telegram", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      const doc = parseHtml(html);

      // Verify auth content div
      const authContent = doc.querySelector("#auth-content");
      expect(authContent).toBeTruthy();

      // Verify Telegram link is present with bot username
      const telegramLink = doc.querySelector(
        'a[href*="t.me"]',
      ) as HTMLAnchorElement;
      expect(telegramLink).toBeTruthy();
      expect(telegramLink.href).toContain(
        `t.me/${config.BOT_USERNAME}?start=login_`,
      );
      expect(telegramLink.target).toBe("_blank");
      expect(html).toContain(`@${config.BOT_USERNAME}`);

      // Verify AuthPolling component with immediate polling trigger
      const authPolling = doc.querySelector("#auth-polling");
      expect(authPolling).toBeTruthy();
      expect(authPolling?.getAttribute("hx-get")).toContain("/auth/check/");
      expect(authPolling?.getAttribute("hx-trigger")).toBe("load, every 2s");
      expect(html).toContain("hx-on--after-settle"); // Auto-open Telegram

      // Verify token expiration message
      expect(html).toContain(
        `Link expires in ${authService.TOKEN_EXPIRATION_MINUTES} minutes`,
      );

      // Extract token and verify database record
      const hxGet = authPolling?.getAttribute("hx-get");
      const token = hxGet?.split("/auth/check/")[1];
      expect(token).toBeTruthy();

      const [dbToken] = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.token, token!))
        .limit(1);

      expect(dbToken).toBeTruthy();
      expect(dbToken?.userId).toBeNull();
      expect(dbToken?.expiresAt).toBeInstanceOf(Date);

      // Token should expire in 5 minutes
      const expectedExpiration = new Date(
        NOW.getTime() + authService.TOKEN_EXPIRATION_MINUTES * 60 * 1000,
      );
      expect(dbToken?.expiresAt?.getTime()).toBe(expectedExpiration.getTime());
    });

    it("should generate unique tokens", async () => {
      const res1 = await app.request("/auth/telegram", { method: "POST" });
      const html1 = await res1.text();
      const doc1 = parseHtml(html1);
      const polling1 = doc1.querySelector("#auth-polling");
      const token1 = polling1?.getAttribute("hx-get")?.split("/auth/check/")[1];

      const res2 = await app.request("/auth/telegram", { method: "POST" });
      const html2 = await res2.text();
      const doc2 = parseHtml(html2);
      const polling2 = doc2.querySelector("#auth-polling");
      const token2 = polling2?.getAttribute("hx-get")?.split("/auth/check/")[1];

      expect(token1).toBeTruthy();
      expect(token2).toBeTruthy();
      expect(token1).not.toBe(token2);
    });
  });

  describe("GET /auth/check/:token", () => {
    it("should return pending status with proper AuthPolling component and HTMX attributes", async () => {
      const result = await authService.createAuthToken();

      const res = await app.request(`/auth/check/${result.token}`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("hx-redirect")).toBeNull();

      const html = await res.text();
      const doc = parseHtml(html);

      // Verify AuthPolling component with continuation polling (load delay:2s)
      const authPolling = doc.querySelector("#auth-polling");
      expect(authPolling).toBeTruthy();
      expect(authPolling?.getAttribute("hx-get")).toBe(
        `/auth/check/${result.token}`,
      );
      expect(authPolling?.getAttribute("hx-trigger")).toBe("load delay:2s");
      expect(authPolling?.getAttribute("hx-target")).toBe("#auth-polling");
      expect(authPolling?.getAttribute("hx-swap")).toBe("outerHTML");
      expect(html).toContain("Waiting for authentication");

      // Verify manual check button
      const button = doc.querySelector("button");
      expect(button).toBeTruthy();
      expect(button?.getAttribute("type")).toBe("button");
      expect(button?.getAttribute("hx-get")).toBe(
        `/auth/check/${result.token}`,
      );
      expect(button?.textContent).toContain(
        "Click here if you completed the login",
      );
    });

    it("should return success with session cookie and redirect when token is claimed", async () => {
      const user = await createUser(db);
      const telegramUser = await createTelegramUser(
        db,
        user.id,
        "telegram-id-123",
      );

      const result = await authService.createAuthToken();
      await authService.claimAuthToken(
        result.token,
        telegramUser.telegramId,
        telegramUser.username,
      );

      const res = await app.request(`/auth/check/${result.token}`);

      expect(res.status).toBe(200);
      expect(res.headers.get("hx-redirect")).toBe("/");

      // Verify session cookie with security attributes
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("lateread_session=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");
      expect(setCookie).toContain("Path=/");

      // Verify MaxAge is set correctly
      const maxAgeMatch = setCookie?.match(/Max-Age=(\d+)/);
      expect(maxAgeMatch).toBeTruthy();
      const maxAge = Number.parseInt(maxAgeMatch![1]!, 10);
      expect(maxAge).toBe(config.SESSION_MAX_AGE_DAYS * 24 * 60 * 60);

      const html = await res.text();
      expect(html).toContain("Authentication successful");
      expect(html).toContain("Redirecting");

      // Should be idempotent - second check still succeeds
      const res2 = await app.request(`/auth/check/${result.token}`);
      expect(res2.status).toBe(200);
      expect(res2.headers.get("hx-redirect")).toBe("/");
    });

    it("should return expired status with AuthError for expired or non-existent tokens", async () => {
      // Test expired token
      const expiredToken = crypto.randomUUID();
      await db.insert(authTokens).values({
        token: expiredToken,
        userId: null,
        expiresAt: new Date(NOW.getTime() - 1000),
      });

      const res1 = await app.request(`/auth/check/${expiredToken}`);
      expect(res1.status).toBe(200);
      expect(res1.headers.get("hx-redirect")).toBeNull();

      const html1 = await res1.text();
      const doc1 = parseHtml(html1);

      expect(html1).toContain("Authentication session expired");
      expect(html1).toContain("Please try again");

      const button1 = doc1.querySelector("button");
      expect(button1?.getAttribute("hx-post")).toBe("/auth/telegram");
      expect(button1?.textContent).toContain("Login with Telegram");

      // Test non-existent token
      const res2 = await app.request("/auth/check/non-existent-token");
      const html2 = await res2.text();
      expect(html2).toContain("Authentication session expired");
      expect(html2).toContain("Please try again");
    });
  });

  describe("POST /auth/logout", () => {
    it("should clear session and redirect to home even without existing session", async () => {
      const res = await app.request("/auth/logout", {
        method: "POST",
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");

      // Should clear session cookie
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("lateread_session=");
      expect(setCookie).toContain("Max-Age=0");
    });
  });

  describe("Token Expiration Edge Cases", () => {
    it("should handle token expiration boundary conditions correctly", async () => {
      // Test 1: Token expiring exactly at NOW (still valid, comparison is <)
      const tokenNow = crypto.randomUUID();
      await db.insert(authTokens).values({
        token: tokenNow,
        userId: null,
        expiresAt: NOW,
      });

      const res1 = await app.request(`/auth/check/${tokenNow}`);
      expect(await res1.text()).toContain("Waiting for authentication");

      // Test 2: Token expired 1ms ago (expired)
      const tokenExpired = crypto.randomUUID();
      await db.insert(authTokens).values({
        token: tokenExpired,
        userId: null,
        expiresAt: new Date(NOW.getTime() - 1),
      });

      const res2 = await app.request(`/auth/check/${tokenExpired}`);
      expect(await res2.text()).toContain("Authentication session expired");

      // Test 3: Token expiring in 1ms (still valid)
      const tokenFuture = crypto.randomUUID();
      await db.insert(authTokens).values({
        token: tokenFuture,
        userId: null,
        expiresAt: new Date(NOW.getTime() + 1),
      });

      const res3 = await app.request(`/auth/check/${tokenFuture}`);
      expect(await res3.text()).toContain("Waiting for authentication");
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      // Test token creation error
      const spyCreateAuthToken = spyOn(authService, "createAuthToken");
      spyCreateAuthToken.mockRejectedValue(new Error("Database error"));

      const res1 = await app.request("/auth/telegram", { method: "POST" });
      expect(res1.status).toBe(500);

      spyCreateAuthToken.mockRestore();

      // Test token check error
      const spyGetAuthTokenStatus = spyOn(authService, "getAuthTokenStatus");
      spyGetAuthTokenStatus.mockRejectedValue(new Error("Database error"));

      const res2 = await app.request("/auth/check/some-token");
      expect(res2.status).toBe(500);

      spyGetAuthTokenStatus.mockRestore();
    });
  });
});
