import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { config } from "./config";

const SESSION_COOKIE_NAME = "lateread_session";
const SESSION_MAX_AGE = config.SESSION_MAX_AGE_DAYS * 24 * 60 * 60; // Convert to seconds

interface SessionData {
  userId: string;
}

/**
 * Simple session implementation using signed cookies
 * Stores userId in a secure, HTTP-only cookie
 */

/**
 * Get session data from request
 */
export function getSession(c: Context): SessionData | null {
  const sessionCookie = getCookie(c, SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    return null;
  }

  try {
    // Verify signature and parse
    const data = verifyAndParse(sessionCookie);
    return data;
  } catch (error) {
    console.error("Invalid session cookie:", error);
    return null;
  }
}

/**
 * Set session data in response
 */
export function setSession(c: Context, data: SessionData): void {
  const sessionValue = signAndStringify(data);

  setCookie(c, SESSION_COOKIE_NAME, sessionValue, {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
  });
}

/**
 * Clear session from response
 */
export function clearSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
  });
}

/**
 * Sign and stringify session data
 */
function signAndStringify(data: SessionData): string {
  const payload = JSON.stringify(data);
  const signature = createSignature(payload);
  return `${payload}.${signature}`;
}

/**
 * Verify signature and parse session data
 */
function verifyAndParse(signedValue: string): SessionData {
  const parts = signedValue.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid session format");
  }

  const payload = parts[0];
  const signature = parts[1];

  if (!payload || !signature) {
    throw new Error("Invalid session format");
  }

  const expectedSignature = createSignature(payload);

  if (signature !== expectedSignature) {
    throw new Error("Invalid session signature");
  }

  return JSON.parse(payload) as SessionData;
}

/**
 * Create signature using Bun's built-in hash
 */
function createSignature(data: string): string {
  // Simple signature using Bun's built-in crypto
  const hash = Bun.hash(config.SESSION_SECRET + data).toString(36);
  return hash;
}
