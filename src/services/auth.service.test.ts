import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db, resetDatabase } from "../../test/bootstrap";
import { authTokens, telegramUsers, users } from "../db/schema";
import { config } from "../lib/config";
import {
  claimAuthToken,
  cleanupExpiredTokens,
  createAuthToken,
  getAuthTokenStatus,
  TOKEN_EXPIRATION_MINUTES,
} from "./auth.service";

describe("auth", () => {
  beforeEach(() => {
    resetDatabase();
  });

  describe("createAuthToken", () => {
    it("should create a new auth token", async () => {
      const result = await createAuthToken();

      expect(result.token).toBeDefined();
      expect(result.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(result.telegramUrl).toBe(
        `https://t.me/${config.BOT_USERNAME}?start=login_${result.token}`,
      );
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("should set expiration time correctly", async () => {
      const before = Date.now();
      const result = await createAuthToken();
      const after = Date.now();

      const expectedExpiry = before + TOKEN_EXPIRATION_MINUTES * 60 * 1000;
      const actualExpiry = result.expiresAt.getTime();

      expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry);
      expect(actualExpiry).toBeLessThanOrEqual(
        after + TOKEN_EXPIRATION_MINUTES * 60 * 1000,
      );
    });

    it("should store token in database", async () => {
      const result = await createAuthToken();

      const status = await getAuthTokenStatus(result.token);
      expect(status.status).toBe("pending");
    });
  });

  describe("claimAuthToken", () => {
    it("should claim a valid token for new user", async () => {
      const { token } = await createAuthToken();

      const result = await claimAuthToken(
        token,
        "123456789",
        "testuser",
        "Test",
        "User",
      );

      expect(result).not.toBeNull();
      expect(result?.userId).toBeDefined();
      expect(result?.telegramId).toBe("123456789");
      expect(result?.username).toBe("testuser");
    });

    it("should reuse existing telegram user when claiming token", async () => {
      // First claim creates a new user
      const { token: token1 } = await createAuthToken();
      const result1 = await claimAuthToken(
        token1,
        "123456789",
        "testuser",
        "Test",
        "User",
      );

      expect(result1).not.toBeNull();
      const firstUserId = result1?.userId;

      // Second claim with same telegram ID should reuse the same user
      const { token: token2 } = await createAuthToken();
      const result2 = await claimAuthToken(
        token2,
        "123456789",
        "testuser",
        "Test",
        "User",
      );

      expect(result2).not.toBeNull();
      expect(result2?.userId).toBe(firstUserId);
      expect(result2?.telegramId).toBe("123456789");
    });

    it("should return null for non-existent token", async () => {
      const result = await claimAuthToken(
        "invalid-token",
        "123456789",
        "testuser",
      );

      expect(result).toBeNull();
    });

    it("should return null for expired token", async () => {
      const { token } = await createAuthToken();

      // Wait for token to expire (simulate by creating expired token)
      const expiredDate = new Date(Date.now() - 1000);

      // Update the token to be expired
      await db
        .update(authTokens)
        .set({ expiresAt: expiredDate })
        .where(eq(authTokens.token, token));

      const result = await claimAuthToken(token, "123456789", "testuser");

      expect(result).toBeNull();
    });

    it("should return null for already claimed token", async () => {
      const { token } = await createAuthToken();

      // Claim token once
      await claimAuthToken(token, "123456789", "testuser", "Test", "User");

      // Try to claim again
      const result = await claimAuthToken(token, "987654321", "anotheruser");

      expect(result).toBeNull();
    });

    it("should update token status after claiming", async () => {
      const { token } = await createAuthToken();

      await claimAuthToken(token, "123456789", "testuser", "Test", "User");

      const status = await getAuthTokenStatus(token);
      expect(status.status).toBe("success");
      if (status.status === "success") {
        expect(status.userId).toBeDefined();
      }
    });

    it("should create user and telegram user records in database", async () => {
      const { token } = await createAuthToken();

      const result = await claimAuthToken(
        token,
        "123456789",
        "testuser",
        "Test",
        "User",
      );

      expect(result).not.toBeNull();

      // Verify user record exists
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, result!.userId))
        .limit(1);

      expect(user).toBeDefined();
      expect(user?.id).toBe(result?.userId);

      // Verify telegram user record exists with correct data
      const [telegramUser] = await db
        .select()
        .from(telegramUsers)
        .where(eq(telegramUsers.telegramId, "123456789"))
        .limit(1);

      expect(telegramUser).toBeDefined();
      expect(telegramUser?.userId).toBe(result?.userId);
      expect(telegramUser?.telegramId).toBe("123456789");
      expect(telegramUser?.username).toBe("testuser");
      expect(telegramUser?.firstName).toBe("Test");
      expect(telegramUser?.lastName).toBe("User");
    });

    it("should handle null username correctly", async () => {
      const { token } = await createAuthToken();

      const result = await claimAuthToken(
        token,
        "999999999",
        null,
        "John",
        "Doe",
      );

      expect(result).not.toBeNull();
      expect(result?.username).toBeNull();

      // Verify telegram user record has null username
      const [telegramUser] = await db
        .select()
        .from(telegramUsers)
        .where(eq(telegramUsers.telegramId, "999999999"))
        .limit(1);

      expect(telegramUser).toBeDefined();
      expect(telegramUser?.username).toBeNull();
      expect(telegramUser?.firstName).toBe("John");
      expect(telegramUser?.lastName).toBe("Doe");
    });

    it("should not create duplicate users for same telegram ID", async () => {
      const { token: token1 } = await createAuthToken();
      await claimAuthToken(token1, "123456789", "testuser", "Test", "User");

      // Count users before second claim
      const usersBefore = await db.select().from(users);
      const telegramUsersBefore = await db.select().from(telegramUsers);

      // Claim second token with same telegram ID
      const { token: token2 } = await createAuthToken();
      await claimAuthToken(token2, "123456789", "testuser", "Test", "User");

      // Count users after second claim
      const usersAfter = await db.select().from(users);
      const telegramUsersAfter = await db.select().from(telegramUsers);

      // Should have same number of users and telegram users
      expect(usersAfter).toHaveLength(usersBefore.length);
      expect(telegramUsersAfter).toHaveLength(telegramUsersBefore.length);
    });
  });

  describe("getAuthTokenStatus", () => {
    it("should return pending for unclaimed token", async () => {
      const { token } = await createAuthToken();

      const status = await getAuthTokenStatus(token);

      expect(status.status).toBe("pending");
    });

    it("should return success for claimed token", async () => {
      const { token } = await createAuthToken();
      const claimResult = await claimAuthToken(token, "123456789", "testuser");

      const status = await getAuthTokenStatus(token);

      expect(status.status).toBe("success");
      if (status.status === "success" && claimResult) {
        expect(status.userId).toBe(claimResult.userId);
      }
    });

    it("should return expired for expired token", async () => {
      const { token } = await createAuthToken();

      // Update the token to be expired
      const expiredDate = new Date(Date.now() - 1000);
      await db
        .update(authTokens)
        .set({ expiresAt: expiredDate })
        .where(eq(authTokens.token, token));

      const status = await getAuthTokenStatus(token);

      expect(status.status).toBe("expired");
    });

    it("should return expired for non-existent token", async () => {
      const status = await getAuthTokenStatus("invalid-token");

      expect(status.status).toBe("expired");
    });
  });

  describe("cleanupExpiredTokens", () => {
    it("should delete expired tokens", async () => {
      // Create expired token
      const { token: expiredToken } = await createAuthToken();
      const expiredDate = new Date(Date.now() - 1000);
      await db
        .update(authTokens)
        .set({ expiresAt: expiredDate })
        .where(eq(authTokens.token, expiredToken));

      // Create valid token
      const { token: validToken } = await createAuthToken();

      // Clean up
      await cleanupExpiredTokens();

      // Check that expired token is gone
      const expiredStatus = await getAuthTokenStatus(expiredToken);
      expect(expiredStatus.status).toBe("expired");

      // Check that valid token still exists
      const validStatus = await getAuthTokenStatus(validToken);
      expect(validStatus.status).toBe("pending");
    });

    it("should not delete valid tokens", async () => {
      const { token } = await createAuthToken();

      await cleanupExpiredTokens();

      const status = await getAuthTokenStatus(token);
      expect(status.status).toBe("pending");
    });
  });
});
