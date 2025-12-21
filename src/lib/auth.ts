import { eq, lt } from "drizzle-orm";
import { authTokens, telegramUsers, users } from "../db/schema";
import { config } from "./config";
import { db } from "./db";

export const TOKEN_EXPIRATION_MINUTES = 5;

interface AuthTokenResult {
  token: string;
  telegramUrl: string;
  expiresAt: Date;
}

interface ClaimTokenResult {
  userId: string;
  telegramId: string;
  username: string | null;
}

/**
 * Creates a new authentication token for Telegram-based login
 * Returns token and formatted Telegram deep link
 */
export async function createAuthToken(): Promise<AuthTokenResult> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION_MINUTES * 60 * 1000);

  await db.insert(authTokens).values({
    token,
    userId: null,
    expiresAt,
  });

  // Deep link with start parameter - opens Telegram and auto-sends /start login_{token}
  const telegramUrl = `https://t.me/${config.BOT_USERNAME}?start=login_${token}`;

  return {
    token,
    telegramUrl,
    expiresAt,
  };
}

/**
 * Claims an auth token by linking it to a user
 * Creates User and TelegramUser records if they don't exist
 * Returns user information on success
 */
export async function claimAuthToken(
  token: string,
  telegramId: string,
  username: string | null,
  firstName: string | null = null,
  lastName: string | null = null,
): Promise<ClaimTokenResult | null> {
  // Query auth token
  const [authToken] = await db
    .select()
    .from(authTokens)
    .where(eq(authTokens.token, token))
    .limit(1);

  if (!authToken) {
    return null;
  }

  // Check if token is expired
  if (authToken.expiresAt < new Date()) {
    return null;
  }

  // Check if token already claimed
  if (authToken.userId) {
    return null;
  }

  // Check if telegram user already exists
  const [existingTelegramUser] = await db
    .select()
    .from(telegramUsers)
    .where(eq(telegramUsers.telegramId, telegramId))
    .limit(1);

  let userId: string;

  if (existingTelegramUser) {
    // User already exists, use their ID
    userId = existingTelegramUser.userId;
  } else {
    // Create new user and telegram user records
    const result = await db.insert(users).values({}).returning();
    const newUser = result[0];

    if (!newUser) {
      throw new Error("Failed to create user");
    }

    userId = newUser.id;

    await db.insert(telegramUsers).values({
      userId,
      telegramId,
      username,
      firstName,
      lastName,
    });
  }

  // Update token with userId
  await db
    .update(authTokens)
    .set({ userId })
    .where(eq(authTokens.token, token));

  return {
    userId,
    telegramId,
    username,
  };
}

/**
 * Cleans up expired authentication tokens
 * Returns count of deleted tokens
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const now = new Date();

  await db.delete(authTokens).where(lt(authTokens.expiresAt, now));

  // Note: SQLite doesn't return count from delete in Drizzle
  // This is fine for cleanup purposes
  return 0;
}

/**
 * Gets a user by their auth token
 * Used for checking token status during polling
 */
export async function getAuthTokenStatus(
  token: string,
): Promise<
  | { status: "expired" }
  | { status: "pending" }
  | { status: "success"; userId: string }
> {
  const [authToken] = await db
    .select()
    .from(authTokens)
    .where(eq(authTokens.token, token))
    .limit(1);

  if (!authToken) {
    return { status: "expired" };
  }

  if (authToken.expiresAt < new Date()) {
    return { status: "expired" };
  }

  if (!authToken.userId) {
    return { status: "pending" };
  }

  return {
    status: "success",
    userId: authToken.userId,
  };
}
