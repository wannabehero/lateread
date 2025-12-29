import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";
import type { Context } from "hono";
import { clearSession, getSession, setSession } from "./session";

let mockCookies: Record<string, string> = {};

mock.module("hono/cookie", () => ({
  getCookie: (_c: Context, name: string) => mockCookies[name] || undefined,
  setCookie: (_c: Context, name: string, value: string) => {
    mockCookies[name] = value;
  },
  deleteCookie: (_c: Context, name: string) => {
    delete mockCookies[name];
  },
}));

mock.module("./config", () => ({
  config: {
    SESSION_SECRET: "test-secret-key-for-hmac-sha256-signing",
    SESSION_MAX_AGE_DAYS: 7,
    NODE_ENV: "test",
  },
}));

function createMockContext(): Context {
  return {
    req: {
      header: (_name: string) => undefined,
    },
    header: () => {},
    set: () => {},
  } as unknown as Context;
}

describe("session", () => {
  beforeEach(() => {
    mockCookies = {};
  });

  afterEach(() => {
    setSystemTime();
  });

  describe("setSession and getSession", () => {
    it("should create session with valid HMAC signature", () => {
      const c = createMockContext();

      setSession(c, { userId: "user123" });

      // Verify cookie was set
      const cookieValue = mockCookies.lateread_session;
      expect(cookieValue).toBeTruthy();
      expect(cookieValue).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/); // base64url.base64url format

      const session = getSession(c);

      expect(session).not.toBeNull();
      expect(session?.userId).toBe("user123");
      expect(session?.iat).toBeGreaterThan(0);
      expect(session?.exp).toBeGreaterThan(session?.iat ?? Infinity);
    });

    it("should return null for missing session cookie", () => {
      const c = createMockContext();
      const session = getSession(c);

      expect(session).toBeNull();
    });

    it("should return null for malformed session cookie", () => {
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
        const session = getSession(c);
        expect(session).toBeNull();
      }
    });

    it("should reject session with tampered payload", () => {
      const c = createMockContext();

      // Create valid session
      setSession(c, { userId: "user123" });
      const originalCookie = mockCookies.lateread_session;

      if (!originalCookie) {
        throw new Error("Original cookie not found");
      }

      // Tamper with payload (change base64url encoded data)
      const [payload, signature] = originalCookie.split(".");
      const tamperedPayload = `${payload}X`; // Slightly modify payload
      const tamperedCookie = `${tamperedPayload}.${signature}`;

      mockCookies.lateread_session = tamperedCookie;
      const session = getSession(c);

      expect(session).toBeNull(); // Should reject tampered session
    });

    it("should reject session with tampered signature", () => {
      const c = createMockContext();

      // Create valid session
      setSession(c, { userId: "user123" });
      const originalCookie = mockCookies.lateread_session;

      if (!originalCookie) {
        throw new Error("Original cookie not found");
      }

      // Tamper with signature
      const [payload, signature] = originalCookie.split(".");
      const tamperedSignature = `${signature?.slice(0, -1)}X`; // Change last char
      const tamperedCookie = `${payload}.${tamperedSignature}`;

      mockCookies.lateread_session = tamperedCookie;
      const session = getSession(c);

      expect(session).toBeNull(); // Should reject tampered signature
    });

    it("should reject expired session", () => {
      setSystemTime(new Date("2025-12-15T12:00:00Z"));

      const c = createMockContext();

      setSession(c, { userId: "user123" });

      setSystemTime(new Date("2026-12-15T12:00:00Z"));

      const session = getSession(c);
      expect(session).toBeNull();
    });

    it("should accept session that is not yet expired", () => {
      setSystemTime(new Date("2025-12-15T12:00:00Z"));

      const c = createMockContext();
      setSession(c, { userId: "user456" });

      const session = getSession(c);

      expect(session).toBeTruthy();
      expect(session?.userId).toBe("user456");
      expect(session?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe("clearSession", () => {
    it("should clear session cookie", () => {
      const c = createMockContext();

      // Set a session first
      setSession(c, { userId: "user123" });
      expect(mockCookies.lateread_session).toBeTruthy();

      // Clear the session
      clearSession(c);
      expect(mockCookies.lateread_session).toBeUndefined();
    });
  });

  describe("base64url encoding", () => {
    it("should use URL-safe characters (no +, /, =)", () => {
      const c = createMockContext();

      setSession(c, { userId: "user-with-special-chars-!@#$%^&*()" });

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
    it("should produce different signatures for different payloads", () => {
      const c1 = createMockContext();
      const c2 = createMockContext();

      setSession(c1, { userId: "user1" });
      const cookie1 = mockCookies.lateread_session;

      // Clear and create second session
      mockCookies = {};
      setSession(c2, { userId: "user2" });
      const cookie2 = mockCookies.lateread_session;

      if (!cookie1 || !cookie2) {
        throw new Error("Cookies not set");
      }

      expect(cookie1).not.toBe(cookie2);

      // Even the signatures should be different
      const [, sig1] = cookie1.split(".");
      const [, sig2] = cookie2.split(".");
      expect(sig1).not.toBe(sig2);
    });

    it("should produce consistent signatures for same data and timestamp", () => {
      // This test verifies that HMAC is deterministic
      setSystemTime(new Date("2025-12-15T12:00:00Z"));

      const c = createMockContext();
      setSession(c, { userId: "test-user" });

      const cookieValue = mockCookies.lateread_session;

      if (!cookieValue) {
        throw new Error("Cookie not set");
      }

      const [, sig1] = cookieValue.split(".");

      expect(sig1).toBe("X4aFQWw4okGaTEgZyNTChD2FJo53lDZhR3qFiVR9MRM");
    });
  });
});
