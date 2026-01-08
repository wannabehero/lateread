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
    it("should create auth token and return HTMX fragment with polling", async () => {
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

      // Verify Telegram link is present
      const telegramLink = doc.querySelector(
        'a[href*="t.me"]',
      ) as HTMLAnchorElement;
      expect(telegramLink).toBeTruthy();
      expect(telegramLink.href).toContain(
        `t.me/${config.BOT_USERNAME}?start=login_`,
      );
      expect(telegramLink.target).toBe("_blank");

      // Verify AuthPolling component is present
      const authPolling = doc.querySelector("#auth-polling");
      expect(authPolling).toBeTruthy();
      expect(authPolling?.getAttribute("hx-get")).toContain("/auth/check/");
      expect(authPolling?.getAttribute("hx-trigger")).toBe("load, every 2s");

      // Verify token expiration message
      expect(html).toContain(
        `Link expires in ${authService.TOKEN_EXPIRATION_MINUTES} minutes`,
      );
    });

    it("should create token in database", async () => {
      const res = await app.request("/auth/telegram", {
        method: "POST",
      });

      const html = await res.text();
      const doc = parseHtml(html);

      // Extract token from the polling hx-get attribute
      const authPolling = doc.querySelector("#auth-polling");
      const hxGet = authPolling?.getAttribute("hx-get");
      const token = hxGet?.split("/auth/check/")[1];

      expect(token).toBeTruthy();

      // Verify token exists in database
      const [dbToken] = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.token, token!))
        .limit(1);

      expect(dbToken).toBeTruthy();
      expect(dbToken?.userId).toBeNull();
      expect(dbToken?.expiresAt).toBeInstanceOf(Date);
    });

    it("should set proper expiration time on token", async () => {
      const res = await app.request("/auth/telegram", {
        method: "POST",
      });

      const html = await res.text();
      const doc = parseHtml(html);

      // Extract token from the polling hx-get attribute
      const authPolling = doc.querySelector("#auth-polling");
      const hxGet = authPolling?.getAttribute("hx-get");
      const token = hxGet?.split("/auth/check/")[1];

      const [dbToken] = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.token, token!))
        .limit(1);

      // Token should expire in 5 minutes
      const expectedExpiration = new Date(
        NOW.getTime() + authService.TOKEN_EXPIRATION_MINUTES * 60 * 1000,
      );
      expect(dbToken?.expiresAt?.getTime()).toBe(expectedExpiration.getTime());
    });

    it("should include bot username in telegram URL", async () => {
      const res = await app.request("/auth/telegram", {
        method: "POST",
      });

      const html = await res.text();

      expect(html).toContain(`@${config.BOT_USERNAME}`);
    });
  });

  describe("GET /auth/check/:token", () => {
    it("should return pending status with AuthPolling component", async () => {
      // Create a pending token
      const result = await authService.createAuthToken();

      const res = await app.request(`/auth/check/${result.token}`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      const doc = parseHtml(html);

      // Verify AuthPolling component is returned
      const authPolling = doc.querySelector("#auth-polling");
      expect(authPolling).toBeTruthy();
      expect(authPolling?.getAttribute("hx-get")).toBe(
        `/auth/check/${result.token}`,
      );
      expect(authPolling?.getAttribute("hx-trigger")).toBe("load delay:2s");

      // Should show waiting message
      expect(html).toContain("Waiting for authentication");

      // Should not have hx-redirect header
      expect(res.headers.get("hx-redirect")).toBeNull();
    });

    it("should return success status with session cookie when token is claimed", async () => {
      const user = await createUser(db);
      const telegramUser = await createTelegramUser(
        db,
        user.id,
        "telegram-id-123",
      );

      // Create token and claim it
      const result = await authService.createAuthToken();
      await authService.claimAuthToken(
        result.token,
        telegramUser.telegramId,
        telegramUser.username,
      );

      const res = await app.request(`/auth/check/${result.token}`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      // Should have hx-redirect header
      expect(res.headers.get("hx-redirect")).toBe("/");

      // Should set session cookie
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("lateread_session=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");

      const html = await res.text();
      expect(html).toContain("Authentication successful");
      expect(html).toContain("Redirecting");
    });

    it("should return expired status with AuthError component for expired token", async () => {
      // Create token that expires immediately
      const expiredTime = new Date(NOW.getTime() - 1000); // 1 second ago
      const token = crypto.randomUUID();

      await db.insert(authTokens).values({
        token,
        userId: null,
        expiresAt: expiredTime,
      });

      const res = await app.request(`/auth/check/${token}`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      const doc = parseHtml(html);

      // Should show AuthError component
      expect(html).toContain("Authentication session expired");
      expect(html).toContain("Please try again");

      // Verify button to restart auth flow
      const button = doc.querySelector("button");
      expect(button).toBeTruthy();
      expect(button?.getAttribute("hx-post")).toBe("/auth/telegram");
      expect(button?.textContent).toContain("Login with Telegram");

      // Should not have hx-redirect header
      expect(res.headers.get("hx-redirect")).toBeNull();
    });

    it("should return expired status for non-existent token", async () => {
      const res = await app.request("/auth/check/non-existent-token");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();

      // Should show AuthError component for expired token
      expect(html).toContain("Authentication session expired");
      expect(html).toContain("Please try again");
    });

    it("should handle already claimed token correctly", async () => {
      const user = await createUser(db);
      const telegramUser = await createTelegramUser(
        db,
        user.id,
        "telegram-id-456",
      );

      // Create and claim token
      const result = await authService.createAuthToken();
      await authService.claimAuthToken(
        result.token,
        telegramUser.telegramId,
        telegramUser.username,
      );

      // First check - should succeed
      const res1 = await app.request(`/auth/check/${result.token}`);
      expect(res1.status).toBe(200);
      expect(res1.headers.get("hx-redirect")).toBe("/");

      // Second check - should still succeed (idempotent)
      const res2 = await app.request(`/auth/check/${result.token}`);
      expect(res2.status).toBe(200);
      expect(res2.headers.get("hx-redirect")).toBe("/");
    });

    it("should include proper HTMX attributes in AuthPolling component", async () => {
      const result = await authService.createAuthToken();

      const res = await app.request(`/auth/check/${result.token}`);

      const html = await res.text();
      const doc = parseHtml(html);

      const authPolling = doc.querySelector("#auth-polling");
      expect(authPolling?.getAttribute("hx-target")).toBe("#auth-polling");
      expect(authPolling?.getAttribute("hx-swap")).toBe("outerHTML");
    });

    it("should include manual check button in polling component", async () => {
      const result = await authService.createAuthToken();

      const res = await app.request(`/auth/check/${result.token}`);

      const html = await res.text();
      const doc = parseHtml(html);

      // Should have button for manual check
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
  });

  describe("POST /auth/logout", () => {
    it("should clear session and redirect to home", async () => {
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

    it("should work even without existing session", async () => {
      const res = await app.request("/auth/logout", {
        method: "POST",
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
    });
  });

  describe("Session Management Integration", () => {
    it("should create valid session cookie on successful auth", async () => {
      const user = await createUser(db);
      const telegramUser = await createTelegramUser(
        db,
        user.id,
        "telegram-id-789",
      );

      // Create and claim token
      const result = await authService.createAuthToken();
      await authService.claimAuthToken(
        result.token,
        telegramUser.telegramId,
        telegramUser.username,
      );

      const res = await app.request(`/auth/check/${result.token}`);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();

      // Parse cookie to verify structure
      expect(setCookie).toContain("lateread_session=");
      expect(setCookie).toContain("Path=/");

      // Verify MaxAge is set to SESSION_MAX_AGE_DAYS
      const maxAgeMatch = setCookie?.match(/Max-Age=(\d+)/);
      expect(maxAgeMatch).toBeTruthy();
      const maxAge = Number.parseInt(maxAgeMatch![1]!, 10);
      expect(maxAge).toBe(config.SESSION_MAX_AGE_DAYS * 24 * 60 * 60);
    });

    it("should handle session correctly in production mode", async () => {
      // Note: config.NODE_ENV is loaded from .env.test and set to "test"
      // In production, secure flag would be set
      const user = await createUser(db);
      const telegramUser = await createTelegramUser(
        db,
        user.id,
        "telegram-id-prod",
      );

      const result = await authService.createAuthToken();
      await authService.claimAuthToken(
        result.token,
        telegramUser.telegramId,
        telegramUser.username,
      );

      const res = await app.request(`/auth/check/${result.token}`);

      const setCookie = res.headers.get("set-cookie");

      // In test environment, Secure flag should not be set
      expect(config.NODE_ENV).toBe("test");
      expect(setCookie).not.toContain("Secure");
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully when creating token", async () => {
      // Spy on createAuthToken to throw an error
      const spyCreateAuthToken = spyOn(authService, "createAuthToken");
      spyCreateAuthToken.mockRejectedValue(new Error("Database error"));

      const res = await app.request("/auth/telegram", {
        method: "POST",
      });

      // Error handler should catch this
      expect(res.status).toBe(500);

      spyCreateAuthToken.mockRestore();
    });

    it("should handle database errors gracefully when checking token", async () => {
      // Spy on getAuthTokenStatus to throw an error
      const spyGetAuthTokenStatus = spyOn(authService, "getAuthTokenStatus");
      spyGetAuthTokenStatus.mockRejectedValue(new Error("Database error"));

      const res = await app.request("/auth/check/some-token");

      // Error handler should catch this
      expect(res.status).toBe(500);

      spyGetAuthTokenStatus.mockRestore();
    });
  });

  describe("Token Expiration Edge Cases", () => {
    it("should handle token expiring exactly at check time", async () => {
      // Create token that expires at exactly NOW
      const token = crypto.randomUUID();

      await db.insert(authTokens).values({
        token,
        userId: null,
        expiresAt: NOW,
      });

      const res = await app.request(`/auth/check/${token}`);

      const html = await res.text();

      // Token expires at exactly NOW, still valid (comparison is <, not <=)
      expect(html).toContain("Waiting for authentication");
    });

    it("should handle token expired 1 millisecond ago", async () => {
      // Create token that expired 1 millisecond ago
      const justExpired = new Date(NOW.getTime() - 1);
      const token = crypto.randomUUID();

      await db.insert(authTokens).values({
        token,
        userId: null,
        expiresAt: justExpired,
      });

      const res = await app.request(`/auth/check/${token}`);

      const html = await res.text();

      // Token is expired
      expect(html).toContain("Authentication session expired");
    });

    it("should handle token expiring in 1 millisecond", async () => {
      // Create token that expires in 1 millisecond from NOW
      const almostExpired = new Date(NOW.getTime() + 1);
      const token = crypto.randomUUID();

      await db.insert(authTokens).values({
        token,
        userId: null,
        expiresAt: almostExpired,
      });

      const res = await app.request(`/auth/check/${token}`);

      const html = await res.text();

      // Token is still valid (expires in the future)
      expect(html).toContain("Waiting for authentication");
    });
  });

  describe("HTMX Integration", () => {
    it("should return correct HTMX attributes for polling continuation", async () => {
      const result = await authService.createAuthToken();

      const res = await app.request(`/auth/check/${result.token}`);

      const html = await res.text();
      const doc = parseHtml(html);

      const authPolling = doc.querySelector("#auth-polling");

      // Verify HTMX attributes for continuation polling
      expect(authPolling?.getAttribute("hx-get")).toBe(
        `/auth/check/${result.token}`,
      );
      expect(authPolling?.getAttribute("hx-trigger")).toBe("load delay:2s");
      expect(authPolling?.getAttribute("hx-target")).toBe("#auth-polling");
      expect(authPolling?.getAttribute("hx-swap")).toBe("outerHTML");
    });

    it("should use immediate polling trigger in initial response", async () => {
      const res = await app.request("/auth/telegram", {
        method: "POST",
      });

      const html = await res.text();
      const doc = parseHtml(html);

      const authPolling = doc.querySelector("#auth-polling");

      // Initial polling should check immediately and every 2s
      expect(authPolling?.getAttribute("hx-trigger")).toBe("load, every 2s");
    });

    it("should have auto-open behavior for Telegram URL", async () => {
      const res = await app.request("/auth/telegram", {
        method: "POST",
      });

      const html = await res.text();

      // Should have hx-on--after-settle attribute to auto-open Telegram
      expect(html).toContain("hx-on--after-settle");
      expect(html).toContain("open(");
      expect(html).toContain("_blank");
    });
  });

  describe("Security", () => {
    it("should use HttpOnly cookies for session", async () => {
      const user = await createUser(db);
      const telegramUser = await createTelegramUser(
        db,
        user.id,
        "telegram-id-sec",
      );

      const result = await authService.createAuthToken();
      await authService.claimAuthToken(
        result.token,
        telegramUser.telegramId,
        telegramUser.username,
      );

      const res = await app.request(`/auth/check/${result.token}`);

      const setCookie = res.headers.get("set-cookie");

      // Verify security attributes
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");
      expect(setCookie).toContain("Path=/");
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
});
