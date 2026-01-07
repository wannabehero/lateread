import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";
import type { Context } from "hono";
import { createNoopLogger } from "../../test/fixtures";
import { config } from "./config";
import { clearSession, getSession, setSession } from "./session";

let mockCookies: Record<
  string,
  {
    value: string;
    options?: Record<string, unknown>;
  }
> = {};

mock.module("hono/cookie", () => ({
  getCookie: (_c: Context, name: string) =>
    mockCookies[name]?.value ?? undefined,
  setCookie: (
    _c: Context,
    name: string,
    value: string,
    options: Record<string, unknown>,
  ) => {
    mockCookies[name] = {
      value,
      options,
    };
  },
  deleteCookie: (_c: Context, name: string) => {
    delete mockCookies[name];
  },
}));

function createMockContext(): Context {
  return {
    req: {
      header: (_name: string) => undefined,
    },
    header: () => {},
    set: () => {},
    var: {
      logger: createNoopLogger(),
    },
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
      const cookie = mockCookies.lateread_session;
      expect(cookie).toBeTruthy();
      expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

      const session = getSession(c);

      expect(session).not.toBeNull();
      expect(session?.userId).toBe("user123");
      expect(session?.iat).toBeGreaterThan(0);
      expect(session?.exp).toBeGreaterThan(session?.iat ?? Infinity);
    });

    it("should set cookie with correct security options", () => {
      const c = createMockContext();

      setSession(c, { userId: "user123" });

      const cookie = mockCookies.lateread_session;
      expect(cookie).toBeTruthy();

      // Verify security options
      expect(cookie?.options?.httpOnly).toBe(true);
      expect(cookie?.options?.sameSite).toBe("Strict");
      expect(cookie?.options?.path).toBe("/");
      expect(cookie?.options?.maxAge).toBe(180 * 24 * 60 * 60); // 180 days in seconds

      // In test environment (NODE_ENV=test from .env.test), secure should be false
      // In production (NODE_ENV=production), secure would be true
      expect(cookie?.options?.secure).toBe(false);
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
        mockCookies.lateread_session = {
          value: cookieValue,
        };
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
      const [payload, signature] = originalCookie.value.split(".");
      const tamperedPayload = `${payload}X`; // Slightly modify payload
      const tamperedCookie = `${tamperedPayload}.${signature}`;

      mockCookies.lateread_session = {
        value: tamperedCookie,
      };
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
      const [payload, signature] = originalCookie.value.split(".");
      const tamperedSignature = `${signature?.slice(0, -1)}X`; // Change last char
      const tamperedCookie = `${payload}.${tamperedSignature}`;

      mockCookies.lateread_session = {
        value: tamperedCookie,
      };
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

    it.each([
      { userId: null, iat: 1234567890, exp: 1234657890 }, // null userId
      { userId: "", iat: 1234567890, exp: 1234657890 }, // empty userId
      { userId: "x".repeat(1001), iat: 1234567890, exp: 1234657890 }, // userId too long
      { userId: "valid", iat: -1, exp: 1234657890 }, // negative iat
      { userId: "valid", iat: 1234567890, exp: -1 }, // negative exp
      { userId: "valid", iat: "not-a-number", exp: 1234657890 }, // string iat
      { iat: 1234567890, exp: 1234657890 }, // missing userId
    ])("should reject session with invalid data structure", (payload) => {
      const c = createMockContext();

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

      mockCookies.lateread_session = {
        value: malformedCookie,
      };
      const session = getSession(c);

      // Should reject due to validation failure
      expect(session).toBeNull();
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

      const cookie = mockCookies.lateread_session;

      // Verify no standard base64 characters that aren't URL-safe
      expect(cookie?.value).not.toContain("+");
      expect(cookie?.value).not.toContain("/");
      expect(cookie?.value).not.toContain("=");

      // Should only contain base64url characters
      expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
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
      const [, sig1] = cookie1.value.split(".");
      const [, sig2] = cookie2.value.split(".");
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

      const [, sig1] = cookieValue.value.split(".");

      // Expected signature for SESSION_SECRET from .env.test
      expect(sig1).toBe("GmTWXHKBioNS9X5T_SV_M1xqH14O_De2cEpbpF3rht0");
    });
  });
});
