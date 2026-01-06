import { beforeEach, describe, expect, it } from "bun:test";
import { db, resetDatabase } from "../../test/bootstrap";
import { createTelegramUser, createUser } from "../../test/fixtures";
import { getTelegramUserByTelegramId } from "./telegram-users.service";

describe("telegram-users.service", () => {
  beforeEach(() => {
    resetDatabase();
  });

  describe("getTelegramUserByTelegramId", () => {
    it("should return telegram user by telegram ID", async () => {
      const user = await createUser(db);
      const telegramUser = await createTelegramUser(db, user.id, "123456789", {
        username: "testuser",
        firstName: "Test",
        lastName: "User",
      });

      const result = await getTelegramUserByTelegramId("123456789");

      expect(result).not.toBeNull();
      expect(result?.id).toBe(telegramUser.id);
      expect(result?.userId).toBe(user.id);
    });

    it("should return null for non-existent telegram ID", async () => {
      const result = await getTelegramUserByTelegramId("999999999");

      expect(result).toBeNull();
    });

    it("should return telegram user without optional fields", async () => {
      const user = await createUser(db);
      const telegramUser = await createTelegramUser(db, user.id, "123456789");

      const result = await getTelegramUserByTelegramId("123456789");

      expect(result).not.toBeNull();
      expect(result?.id).toBe(telegramUser.id);
      expect(result?.userId).toBe(user.id);
    });

    it("should isolate telegram users between different users", async () => {
      const user1 = await createUser(db);
      const user2 = await createUser(db);

      const telegramUser1 = await createTelegramUser(db, user1.id, "111111111");
      const telegramUser2 = await createTelegramUser(db, user2.id, "222222222");

      const result1 = await getTelegramUserByTelegramId("111111111");
      const result2 = await getTelegramUserByTelegramId("222222222");

      expect(result1?.userId).toBe(user1.id);
      expect(result1?.id).toBe(telegramUser1.id);

      expect(result2?.userId).toBe(user2.id);
      expect(result2?.id).toBe(telegramUser2.id);
    });

    it("should handle telegram ID as string", async () => {
      const user = await createUser(db);
      await createTelegramUser(db, user.id, "987654321");

      const result = await getTelegramUserByTelegramId("987654321");

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(user.id);
    });

    it("should return correct user ID for telegram user", async () => {
      const user = await createUser(db);
      await createTelegramUser(db, user.id, "555555555");

      const result = await getTelegramUserByTelegramId("555555555");

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(user.id);
    });

    it("should handle multiple telegram users for same user", async () => {
      const user = await createUser(db);

      // Note: In practice, one user should have one telegram account,
      // but the schema allows multiple telegram IDs per user
      await createTelegramUser(db, user.id, "111111111");
      await createTelegramUser(db, user.id, "222222222");

      const result1 = await getTelegramUserByTelegramId("111111111");
      const result2 = await getTelegramUserByTelegramId("222222222");

      expect(result1?.userId).toBe(user.id);
      expect(result2?.userId).toBe(user.id);
    });

    it("should return telegram user with all fields", async () => {
      const user = await createUser(db);
      const telegramUser = await createTelegramUser(db, user.id, "123456789", {
        username: "testuser",
        firstName: "Test",
        lastName: "User",
      });

      const result = await getTelegramUserByTelegramId("123456789");

      expect(result).not.toBeNull();
      expect(result?.id).toBe(telegramUser.id);
      expect(result?.userId).toBe(user.id);
      // Service returns the full telegram user record
      expect(Object.keys(result ?? {}).sort()).toEqual(
        [
          "id",
          "userId",
          "telegramId",
          "username",
          "firstName",
          "lastName",
          "createdAt",
        ].sort(),
      );
    });

    it("should handle long telegram IDs", async () => {
      const user = await createUser(db);
      const longTelegramId = "9876543210123456789";
      await createTelegramUser(db, user.id, longTelegramId);

      const result = await getTelegramUserByTelegramId(longTelegramId);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(user.id);
    });

    it("should handle searching for empty string telegram ID", async () => {
      const result = await getTelegramUserByTelegramId("");

      expect(result).toBeNull();
    });

    it("should handle special characters in telegram ID", async () => {
      const user = await createUser(db);
      // Telegram IDs are numeric, but test the service handles any string
      const specialId = "123-456-789";
      await createTelegramUser(db, user.id, specialId);

      const result = await getTelegramUserByTelegramId(specialId);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(user.id);
    });
  });
});
