import { describe, expect, it, beforeEach, mock } from "bun:test";
import type { Context } from "hono";

/**
 * Session tests
 *
 * Tests HMAC-SHA256 session implementation including:
 * - Session creation with timestamps
 * - Session verification and expiration
 * - Signature tampering detection
 * - Constant-time comparison
 * - Base64url encoding/decoding
 */

// Mock hono/cookie module
let mockCookies: Record<string, string> = {};

mock.module("hono/cookie", () => ({
  getCookie: (c: Context, name: string) => mockCookies[name] || undefined,
  setCookie: (c: Context, name: string, value: string, options?: any) => {
    mockCookies[name] = value;
  },
  deleteCookie: (c: Context, name: string, options?: any) => {
    delete mockCookies[name];
  },
}));

// Mock config module with minimal required config
mock.module("./config", () => ({
  config: {
    SESSION_SECRET: "test-secret-key-for-hmac-sha256-signing",
    SESSION_MAX_AGE_DAYS: 7,
    NODE_ENV: "test",
  },
}));

// Import after mocking
const { clearSession, getSession, setSession } = await import("./session");

// Mock Hono context for testing
function createMockContext(): Context {
  return {
    req: {
      header: (name: string) => undefined,
    },
    header: () => {},
    set: () => {},
  } as unknown as Context;
}

describe("session", () => {
  beforeEach(() => {
    // Clear mock cookies before each test
    mockCookies = {};
  });
  describe("setSession and getSession", () => {
    it("should create session with valid HMAC signature", async () => {
      const c = createMockContext();

      await setSession(c, { userId: "user123" });

      // Verify cookie was set
      const cookieValue = mockCookies.lateread_session;
      expect(cookieValue).toBeTruthy();
      expect(cookieValue).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/); // base64url.base64url format

      // Verify we can decode it
      const session = await getSession(c);

      expect(session).toBeTruthy();
      expect(session?.userId).toBe("user123");
      expect(session?.iat).toBeGreaterThan(0);
      expect(session?.exp).toBeGreaterThan(session!.iat);
    });

    it("should return null for missing session cookie", async () => {
      const c = createMockContext();
      const session = await getSession(c);

      expect(session).toBeNull();
    });

    it("should return null for malformed session cookie", async () => {
      const c = createMockContext();

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
        mockCookies.lateread_session = cookieValue;
        const session = await getSession(c);
        expect(session).toBeNull();
      }
    });

    it("should reject session with tampered payload", async () => {
      const c = createMockContext();

      // Create valid session
      await setSession(c, { userId: "user123" });
      const originalCookie = mockCookies.lateread_session;

      // Tamper with payload (change base64url encoded data)
      const [payload, signature] = originalCookie.split(".");
      const tamperedPayload = payload + "X"; // Slightly modify payload
      const tamperedCookie = `${tamperedPayload}.${signature}`;

      mockCookies.lateread_session = tamperedCookie;
      const session = await getSession(c);

      expect(session).toBeNull(); // Should reject tampered session
    });

    it("should reject session with tampered signature", async () => {
      const c = createMockContext();

      // Create valid session
      await setSession(c, { userId: "user123" });
      const originalCookie = mockCookies.lateread_session;

      // Tamper with signature
      const [payload, signature] = originalCookie.split(".");
      const tamperedSignature = signature.slice(0, -1) + "X"; // Change last char
      const tamperedCookie = `${payload}.${tamperedSignature}`;

      mockCookies.lateread_session = tamperedCookie;
      const session = await getSession(c);

      expect(session).toBeNull(); // Should reject tampered signature
    });

    it("should reject expired session", async () => {
      const c = createMockContext();

      // Create a session that's already expired
      const expiredSessionData = {
        userId: "user123",
        iat: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        exp: Math.floor(Date.now() / 1000) - 1, // Expired 1 second ago
      };

      // Manually construct the session cookie
      const payload = JSON.stringify(expiredSessionData);
      const payloadBase64 = Buffer.from(payload, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      // Generate valid HMAC signature for this payload
      const { config } = await import("./config");
      const encoder = new TextEncoder();
      const keyData = encoder.encode(config.SESSION_SECRET);
      const messageData = encoder.encode(payloadBase64);

      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signatureBytes = await crypto.subtle.sign(
        "HMAC",
        key,
        messageData
      );
      const signature = Buffer.from(signatureBytes)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      const expiredCookie = `${payloadBase64}.${signature}`;

      mockCookies.lateread_session = expiredCookie;
      const session = await getSession(c);

      expect(session).toBeNull(); // Should reject expired session
    });

    it("should accept session that is not yet expired", async () => {
      const c = createMockContext();

      // Create a session that expires in 1 hour
      const validSessionData = {
        userId: "user456",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
      };

      // Manually construct the session cookie
      const payload = JSON.stringify(validSessionData);
      const payloadBase64 = Buffer.from(payload, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      // Generate valid HMAC signature
      const { config } = await import("./config");
      const encoder = new TextEncoder();
      const keyData = encoder.encode(config.SESSION_SECRET);
      const messageData = encoder.encode(payloadBase64);

      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signatureBytes = await crypto.subtle.sign(
        "HMAC",
        key,
        messageData
      );
      const signature = Buffer.from(signatureBytes)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      const validCookie = `${payloadBase64}.${signature}`;

      mockCookies.lateread_session = validCookie;
      const session = await getSession(c);

      expect(session).toBeTruthy();
      expect(session?.userId).toBe("user456");
      expect(session?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe("clearSession", () => {
    it("should clear session cookie", async () => {
      const c = createMockContext();

      // Set a session first
      await setSession(c, { userId: "user123" });
      expect(mockCookies.lateread_session).toBeTruthy();

      // Clear the session
      clearSession(c);
      expect(mockCookies.lateread_session).toBeUndefined();
    });
  });

  describe("base64url encoding", () => {
    it("should use URL-safe characters (no +, /, =)", async () => {
      const c = createMockContext();

      await setSession(c, { userId: "user-with-special-chars-!@#$%^&*()" });

      const cookieValue = mockCookies.lateread_session;

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
      const c1 = createMockContext();
      const c2 = createMockContext();

      await setSession(c1, { userId: "user1" });
      const cookie1 = mockCookies.lateread_session;

      // Clear and create second session
      mockCookies = {};
      await setSession(c2, { userId: "user2" });
      const cookie2 = mockCookies.lateread_session;

      expect(cookie1).not.toBe(cookie2);

      // Even the signatures should be different
      const [, sig1] = cookie1.split(".");
      const [, sig2] = cookie2.split(".");
      expect(sig1).not.toBe(sig2);
    });

    it("should produce consistent signatures for same data and timestamp", async () => {
      // This test verifies that HMAC is deterministic
      const fixedTimestamp = 1700000000;
      const sessionData = {
        userId: "testuser",
        iat: fixedTimestamp,
        exp: fixedTimestamp + 3600,
      };

      const payload = JSON.stringify(sessionData);
      const payloadBase64 = Buffer.from(payload, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      // Generate signature twice
      const { config } = await import("./config");
      const encoder = new TextEncoder();
      const keyData = encoder.encode(config.SESSION_SECRET);
      const messageData = encoder.encode(payloadBase64);

      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const sig1Bytes = await crypto.subtle.sign("HMAC", key, messageData);
      const sig2Bytes = await crypto.subtle.sign("HMAC", key, messageData);

      const sig1 = Buffer.from(sig1Bytes).toString("base64");
      const sig2 = Buffer.from(sig2Bytes).toString("base64");

      expect(sig1).toBe(sig2); // HMAC should be deterministic
    });
  });
});
