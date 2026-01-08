import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";
import { Hono } from "hono";
import { createNoopLogger } from "../../test/fixtures";
import { clearSession, getSession, setSession } from "./session";

// Helper to extract cookie value from Set-Cookie header
function extractCookieValue(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/lateread_session=([^;]+)/);
  return match?.[1] ?? null;
}

// Helper to extract cookie options from Set-Cookie header
function extractCookieOptions(setCookieHeader: string | null): {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  path?: string;
  maxAge?: number;
} {
  if (!setCookieHeader) return {};
  return {
    httpOnly: setCookieHeader.includes("HttpOnly"),
    secure: setCookieHeader.includes("Secure"),
    sameSite: setCookieHeader.match(/SameSite=(\w+)/i)?.[1],
    path: setCookieHeader.match(/Path=([^;]+)/)?.[1],
    maxAge: Number(setCookieHeader.match(/Max-Age=(\d+)/)?.[1]),
  };
}

describe("session", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    // Add logger middleware so c.var.logger is available
    app.use("*", async (c, next) => {
      c.set("logger", createNoopLogger());
      await next();
    });
  });

  afterEach(() => {
    setSystemTime();
  });

  describe("setSession and getSession", () => {
    it("should create session with valid HMAC signature", async () => {
      app.get("/set", (c) => {
        setSession(c, { userId: "user123" });
        return c.text("OK");
      });

      app.get("/get", (c) => {
        const session = getSession(c);
        return c.json(session);
      });

      // Set session
      const setRes = await app.request("/set");
      const setCookie = setRes.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();

      const cookieValue = extractCookieValue(setCookie);
      expect(cookieValue).toBeTruthy();
      expect(cookieValue).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

      // Get session
      const getRes = await app.request("/get", {
        headers: { Cookie: `lateread_session=${cookieValue}` },
      });
      const session = await getRes.json();

      expect(session).not.toBeNull();
      expect(session.userId).toBe("user123");
      expect(session.iat).toBeGreaterThan(0);
      expect(session.exp).toBeGreaterThan(session.iat);
    });

    it("should set cookie with correct security options", async () => {
      app.get("/set", (c) => {
        setSession(c, { userId: "user123" });
        return c.text("OK");
      });

      const res = await app.request("/set");
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();

      const options = extractCookieOptions(setCookie);

      // Verify security options
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe("Strict");
      expect(options.path).toBe("/");
      expect(options.maxAge).toBe(180 * 24 * 60 * 60); // 180 days in seconds

      // In test environment (NODE_ENV=test from .env.test), secure should be false
      // In production (NODE_ENV=production), secure would be true
      expect(options.secure).toBe(false);
    });

    it("should return null for missing session cookie", async () => {
      app.get("/get", (c) => {
        const session = getSession(c);
        return c.json(session);
      });

      const res = await app.request("/get");
      const session = await res.json();

      expect(session).toBeNull();
    });

    it("should return null for malformed session cookie", async () => {
      app.get("/get", (c) => {
        const session = getSession(c);
        return c.json(session);
      });

      // Test various malformed formats
      const malformedCookies = [
        "invalid",
        "no-dot-separator",
        "too.many.dots.here",
        ".leading-dot",
        "trailing-dot.",
        "",
      ];

      for (const cookieValue of malformedCookies) {
        const res = await app.request("/get", {
          headers: { Cookie: `lateread_session=${cookieValue}` },
        });
        const session = await res.json();
        expect(session).toBeNull();
      }
    });

    it("should reject session with tampered payload", async () => {
      app.get("/set", (c) => {
        setSession(c, { userId: "user123" });
        return c.text("OK");
      });

      app.get("/get", (c) => {
        const session = getSession(c);
        return c.json(session);
      });

      // Create valid session
      const setRes = await app.request("/set");
      const setCookie = setRes.headers.get("set-cookie");
      const originalCookie = extractCookieValue(setCookie);

      expect(originalCookie).toBeTruthy();

      // Tamper with payload (change base64url encoded data)
      const [payload, signature] = originalCookie!.split(".");
      const tamperedPayload = `${payload}X`; // Slightly modify payload
      const tamperedCookie = `${tamperedPayload}.${signature}`;

      // Try to use tampered session
      const getRes = await app.request("/get", {
        headers: { Cookie: `lateread_session=${tamperedCookie}` },
      });
      const session = await getRes.json();

      expect(session).toBeNull(); // Should reject tampered session
    });

    it("should reject session with tampered signature", async () => {
      app.get("/set", (c) => {
        setSession(c, { userId: "user123" });
        return c.text("OK");
      });

      app.get("/get", (c) => {
        const session = getSession(c);
        return c.json(session);
      });

      // Create valid session
      const setRes = await app.request("/set");
      const setCookie = setRes.headers.get("set-cookie");
      const originalCookie = extractCookieValue(setCookie);

      expect(originalCookie).toBeTruthy();

      // Tamper with signature
      const [payload, signature] = originalCookie!.split(".");
      const tamperedSignature = `${signature?.slice(0, -1)}X`; // Change last char
      const tamperedCookie = `${payload}.${tamperedSignature}`;

      // Try to use tampered session
      const getRes = await app.request("/get", {
        headers: { Cookie: `lateread_session=${tamperedCookie}` },
      });
      const session = await getRes.json();

      expect(session).toBeNull(); // Should reject tampered signature
    });

    it("should reject expired session", async () => {
      setSystemTime(new Date("2025-12-15T12:00:00Z"));

      app.get("/set", (c) => {
        setSession(c, { userId: "user123" });
        return c.text("OK");
      });

      app.get("/get", (c) => {
        const session = getSession(c);
        return c.json(session);
      });

      // Create session at time T
      const setRes = await app.request("/set");
      const setCookie = setRes.headers.get("set-cookie");
      const cookieValue = extractCookieValue(setCookie);

      // Fast forward past expiration (180 days + 1 year)
      setSystemTime(new Date("2026-12-15T12:00:00Z"));

      // Try to use expired session
      const getRes = await app.request("/get", {
        headers: { Cookie: `lateread_session=${cookieValue}` },
      });
      const session = await getRes.json();

      expect(session).toBeNull();
    });

    it("should accept session that is not yet expired", async () => {
      setSystemTime(new Date("2025-12-15T12:00:00Z"));

      app.get("/set", (c) => {
        setSession(c, { userId: "user456" });
        return c.text("OK");
      });

      app.get("/get", (c) => {
        const session = getSession(c);
        return c.json(session);
      });

      // Create and immediately use session
      const setRes = await app.request("/set");
      const setCookie = setRes.headers.get("set-cookie");
      const cookieValue = extractCookieValue(setCookie);

      const getRes = await app.request("/get", {
        headers: { Cookie: `lateread_session=${cookieValue}` },
      });
      const session = await getRes.json();

      expect(session).toBeTruthy();
      expect(session.userId).toBe("user456");
      expect(session.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it.each([
      { userId: null, iat: 1234567890, exp: 1234657890 }, // null userId
      { userId: "", iat: 1234567890, exp: 1234657890 }, // empty userId
      { userId: "x".repeat(1001), iat: 1234567890, exp: 1234657890 }, // userId too long
      { userId: "valid", iat: -1, exp: 1234657890 }, // negative iat
      { userId: "valid", iat: 1234567890, exp: -1 }, // negative exp
      { userId: "valid", iat: "not-a-number", exp: 1234657890 }, // string iat
      { iat: 1234567890, exp: 1234657890 }, // missing userId
    ])("should reject session with invalid data structure", async (payload) => {
      app.get("/get", (c) => {
        const session = getSession(c);
        return c.json(session);
      });

      const payloadJson = JSON.stringify(payload);
      const payloadBase64 = Buffer.from(payloadJson, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      // Generate valid HMAC signature for the malformed payload
      const hasher = new Bun.CryptoHasher(
        "sha256",
        "test-secret-key-for-hmac-sha256-signing",
      );
      hasher.update(payloadBase64);
      const signature = hasher
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      const malformedCookie = `${payloadBase64}.${signature}`;

      const res = await app.request("/get", {
        headers: { Cookie: `lateread_session=${malformedCookie}` },
      });
      const session = await res.json();

      // Should reject due to validation failure
      expect(session).toBeNull();
    });
  });

  describe("clearSession", () => {
    it("should clear session cookie", async () => {
      app.get("/set", (c) => {
        setSession(c, { userId: "user123" });
        return c.text("OK");
      });

      app.get("/clear", (c) => {
        clearSession(c);
        return c.text("OK");
      });

      app.get("/get", (c) => {
        const session = getSession(c);
        return c.json(session);
      });

      // Set a session first
      const setRes = await app.request("/set");
      const setCookie = setRes.headers.get("set-cookie");
      const cookieValue = extractCookieValue(setCookie);
      expect(cookieValue).toBeTruthy();

      // Verify session works
      const getRes1 = await app.request("/get", {
        headers: { Cookie: `lateread_session=${cookieValue}` },
      });
      const session1 = await getRes1.json();
      expect(session1).toBeTruthy();

      // Clear the session
      const clearRes = await app.request("/clear", {
        headers: { Cookie: `lateread_session=${cookieValue}` },
      });
      const clearCookie = clearRes.headers.get("set-cookie");
      expect(clearCookie).toContain("lateread_session=");
      expect(clearCookie).toContain("Max-Age=0"); // Should expire immediately

      // Verify session is gone after clearing
      const getRes2 = await app.request("/get");
      const session2 = await getRes2.json();
      expect(session2).toBeNull();
    });
  });

  describe("base64url encoding", () => {
    it("should use URL-safe characters (no +, /, =)", async () => {
      app.get("/set", (c) => {
        setSession(c, { userId: "user-with-special-chars-!@#$%^&*()" });
        return c.text("OK");
      });

      const res = await app.request("/set");
      const setCookie = res.headers.get("set-cookie");
      const cookieValue = extractCookieValue(setCookie);

      // Verify no standard base64 characters that aren't URL-safe
      expect(cookieValue).not.toContain("+");
      expect(cookieValue).not.toContain("/");
      expect(cookieValue).not.toContain("=");

      // Should only contain base64url characters
      expect(cookieValue).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });
  });

  describe("HMAC-SHA256 security", () => {
    it("should produce different signatures for different payloads", async () => {
      app.get("/set1", (c) => {
        setSession(c, { userId: "user1" });
        return c.text("OK");
      });

      app.get("/set2", (c) => {
        setSession(c, { userId: "user2" });
        return c.text("OK");
      });

      const res1 = await app.request("/set1");
      const cookie1 = extractCookieValue(res1.headers.get("set-cookie"));

      const res2 = await app.request("/set2");
      const cookie2 = extractCookieValue(res2.headers.get("set-cookie"));

      expect(cookie1).not.toBe(cookie2);

      // Even the signatures should be different
      const [, sig1] = cookie1!.split(".");
      const [, sig2] = cookie2!.split(".");
      expect(sig1).not.toBe(sig2);
    });

    it("should produce consistent signatures for same data and timestamp", async () => {
      // This test verifies that HMAC is deterministic
      setSystemTime(new Date("2025-12-15T12:00:00Z"));

      app.get("/set", (c) => {
        setSession(c, { userId: "test-user" });
        return c.text("OK");
      });

      const res = await app.request("/set");
      const cookieValue = extractCookieValue(res.headers.get("set-cookie"));

      expect(cookieValue).toBeTruthy();

      const [, sig1] = cookieValue!.split(".");

      // Expected signature for SESSION_SECRET from .env.test
      expect(sig1).toBe("GmTWXHKBioNS9X5T_SV_M1xqH14O_De2cEpbpF3rht0");
    });
  });
});
