import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppContext } from "../types/context";
import { config } from "./config";
import { UnauthorizedError } from "./errors";

const SESSION_COOKIE_NAME = "lateread_session";
const SESSION_MAX_AGE = config.SESSION_MAX_AGE_DAYS * 24 * 60 * 60; // Convert to seconds

/**
 * Session data schema with validation
 * Ensures all fields are present and have correct types
 */
const SessionDataSchema = z.object({
  userId: z.string().min(1).max(1000), // Prevent huge userIds
  iat: z.number().int().positive(), // Issued at (Unix timestamp in seconds)
  exp: z.number().int().positive(), // Expiration (Unix timestamp in seconds)
});

type SessionData = z.infer<typeof SessionDataSchema>;

/**
 * Session implementation using HMAC-SHA256 signed cookies
 *
 * Format: base64url(json).hmac_sha256_signature
 * - Payload is base64url-encoded JSON with userId, iat, exp
 * - Signature is HMAC-SHA256(payload, SESSION_SECRET) in base64url
 * - Uses constant-time comparison to prevent timing attacks
 * - Validates expiration timestamp on each request
 *
 * Generally it's almost JWT but I didn't want to bring in a dependency.
 * Also bun is fun and provides primitives for HMAC-SHA256 out of the box.
 */

/**
 * Get session data from request
 * Returns null if session is invalid or expired
 */
export function getSession(c: Context<AppContext>): SessionData | null {
  const sessionCookie = getCookie(c, SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    return null;
  }

  try {
    // Verify HMAC signature and check expiration
    const data = verifyAndParse(sessionCookie);
    return data;
  } catch (error) {
    c.var.logger.error("Invalid session cookie", { error });
    return null;
  }
}

/**
 * Set session data in response
 * Automatically adds iat (issued at) and exp (expiration) timestamps
 */
export function setSession(
  c: Context<AppContext>,
  data: Omit<SessionData, "iat" | "exp">,
): void {
  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    ...data,
    iat: now,
    exp: now + SESSION_MAX_AGE,
  };

  const sessionValue = signAndStringify(sessionData);

  setCookie(c, SESSION_COOKIE_NAME, sessionValue, {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
  });
}

/**
 * Clear session from response
 */
export function clearSession(c: Context<AppContext>): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
  });
}

/**
 * Sign and stringify session data with HMAC-SHA256
 * Returns: base64url(json).base64url(hmac_signature)
 */
function signAndStringify(data: SessionData): string {
  const payload = JSON.stringify(data);
  const payloadBase64 = toBase64Url(payload);
  const signature = createHmacSignature(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

/**
 * Verify HMAC signature and parse session data
 * Validates signature using constant-time comparison and checks expiration
 */
function verifyAndParse(signedValue: string): SessionData {
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
  const expectedSignature = createHmacSignature(payloadBase64);

  // Use crypto.timingSafeEqual for constant-time comparison
  const signatureBuffer = Buffer.from(signature, "utf-8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf-8");

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new UnauthorizedError("Invalid session signature");
  }

  // Decode and parse payload
  const payload = fromBase64Url(payloadBase64);

  // Parse and validate session data structure
  let parsedData: unknown;
  try {
    parsedData = JSON.parse(payload);
  } catch {
    throw new Error("Invalid session format");
  }

  // Validate session data schema
  const parseResult = SessionDataSchema.safeParse(parsedData);
  if (!parseResult.success) {
    throw new Error("Invalid session data structure");
  }

  const data = parseResult.data;

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (data.exp < now) {
    throw new UnauthorizedError("Session expired");
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
  try {
    // Convert base64url back to standard base64
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    while (base64.length % 4) {
      base64 += "=";
    }
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    throw new Error("Invalid session format");
  }
}

/**
 * Create HMAC-SHA256 signature for the given data using Bun.CryptoHasher
 * Returns base64url-encoded signature
 */
function createHmacSignature(data: string): string {
  const hasher = new Bun.CryptoHasher("sha256", config.SESSION_SECRET);
  hasher.update(data);
  const signature = hasher.digest("base64");
  // Convert to base64url (replace +/= with URL-safe chars)
  return signature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
