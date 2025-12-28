import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { config } from "./config";

const SESSION_COOKIE_NAME = "lateread_session";
const SESSION_MAX_AGE = config.SESSION_MAX_AGE_DAYS * 24 * 60 * 60; // Convert to seconds

interface SessionData {
  userId: string;
  iat: number; // Issued at (Unix timestamp in seconds)
  exp: number; // Expiration (Unix timestamp in seconds)
}

/**
 * Session implementation using HMAC-SHA256 signed cookies
 *
 * Format: base64url(json).hmac_sha256_signature
 * - Payload is base64url-encoded JSON with userId, iat, exp
 * - Signature is HMAC-SHA256(payload, SESSION_SECRET) in base64url
 * - Uses constant-time comparison to prevent timing attacks
 * - Validates expiration timestamp on each request
 */

/**
 * Get session data from request
 * Returns null if session is invalid or expired
 */
export async function getSession(c: Context): Promise<SessionData | null> {
  const sessionCookie = getCookie(c, SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    return null;
  }

  try {
    // Verify HMAC signature and check expiration
    const data = await verifyAndParse(sessionCookie);
    return data;
  } catch (error) {
    console.error("Invalid session cookie:", error);
    return null;
  }
}

/**
 * Set session data in response
 * Automatically adds iat (issued at) and exp (expiration) timestamps
 */
export async function setSession(
  c: Context,
  data: Omit<SessionData, "iat" | "exp">
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    ...data,
    iat: now,
    exp: now + SESSION_MAX_AGE,
  };

  const sessionValue = await signAndStringify(sessionData);

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
 * Sign and stringify session data with HMAC-SHA256
 * Returns: base64url(json).base64url(hmac_signature)
 */
async function signAndStringify(data: SessionData): Promise<string> {
  const payload = JSON.stringify(data);
  const payloadBase64 = toBase64Url(payload);
  const signature = await createHmacSignature(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

/**
 * Verify HMAC signature and parse session data
 * Validates signature using constant-time comparison and checks expiration
 */
async function verifyAndParse(signedValue: string): Promise<SessionData> {
  const parts = signedValue.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid session format");
  }

  const payloadBase64 = parts[0];
  const signature = parts[1];

  if (!payloadBase64 || !signature) {
    throw new Error("Invalid session format");
  }

  // Verify HMAC signature using constant-time comparison
  const expectedSignature = await createHmacSignature(payloadBase64);

  if (!constantTimeEqual(signature, expectedSignature)) {
    throw new Error("Invalid session signature");
  }

  // Decode and parse payload
  const payload = fromBase64Url(payloadBase64);
  const data = JSON.parse(payload) as SessionData;

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (data.exp < now) {
    throw new Error("Session expired");
  }

  return data;
}

/**
 * Base64url encode a string (RFC 4648)
 * Converts standard base64 to URL-safe base64url (no padding, - instead of +, _ instead of /)
 */
function toBase64Url(str: string): string {
  const base64 = Buffer.from(str, "utf-8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Base64url decode to string
 */
function fromBase64Url(base64url: string): string {
  // Convert base64url back to standard base64
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Create HMAC-SHA256 signature for the given data
 * Returns base64url-encoded signature
 */
async function createHmacSignature(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(config.SESSION_SECRET);
  const messageData = encoder.encode(data);

  // Import key for HMAC
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign the data
  const signature = await crypto.subtle.sign("HMAC", key, messageData);

  // Convert to base64url
  const base64 = Buffer.from(signature).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Constant-time string comparison to prevent timing attacks
 * Compares two strings byte-by-byte, always checking all characters
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
