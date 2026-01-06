import { beforeEach, describe, expect, it } from "bun:test";
import { db, resetDatabase } from "../../test/bootstrap";
import { createSubscription, createUser } from "../../test/fixtures";
import { getAllowedFeaturesForUser } from "./subscription.service";

describe("subscription.service", () => {
  beforeEach(() => {
    resetDatabase();
  });

  describe("getAllowedFeaturesForUser", () => {
    it("should return no features for user without subscription", async () => {
      const user = await createUser(db);

      const features = await getAllowedFeaturesForUser(user.id);

      expect(features).toEqual({
        summary: false,
        tts: false,
      });
    });

    it("should return summary and tts for full subscription", async () => {
      const user = await createUser(db);
      await createSubscription(db, user.id, { type: "full" });

      const features = await getAllowedFeaturesForUser(user.id);

      expect(features).toEqual({
        summary: true,
        tts: true,
      });
    });

    it("should return only summary for lite subscription", async () => {
      const user = await createUser(db);
      await createSubscription(db, user.id, { type: "lite" });

      const features = await getAllowedFeaturesForUser(user.id);

      expect(features).toEqual({
        summary: true,
        tts: false,
      });
    });

    it("should return no features for expired subscription", async () => {
      const user = await createUser(db);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      await createSubscription(db, user.id, {
        type: "full",
        expiresAt: yesterday,
      });

      const features = await getAllowedFeaturesForUser(user.id);

      expect(features).toEqual({
        summary: false,
        tts: false,
      });
    });

    it("should use the active subscription when multiple exist", async () => {
      const user = await createUser(db);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Create expired full subscription
      await createSubscription(db, user.id, {
        type: "full",
        expiresAt: yesterday,
      });

      // Create active lite subscription
      await createSubscription(db, user.id, {
        type: "lite",
        expiresAt: tomorrow,
      });

      const features = await getAllowedFeaturesForUser(user.id);

      // Should use the active lite subscription
      expect(features).toEqual({
        summary: true,
        tts: false,
      });
    });

    it("should treat subscription expiring in future as active", async () => {
      const user = await createUser(db);
      const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      await createSubscription(db, user.id, {
        type: "full",
        expiresAt: nextYear,
      });

      const features = await getAllowedFeaturesForUser(user.id);

      expect(features).toEqual({
        summary: true,
        tts: true,
      });
    });

    it("should handle subscription expiring in 1 second", async () => {
      const user = await createUser(db);
      const oneSecondFromNow = new Date(Date.now() + 1000);

      await createSubscription(db, user.id, {
        type: "full",
        expiresAt: oneSecondFromNow,
      });

      const features = await getAllowedFeaturesForUser(user.id);

      expect(features).toEqual({
        summary: true,
        tts: true,
      });
    });

    it("should isolate subscriptions between users", async () => {
      const user1 = await createUser(db);
      const user2 = await createUser(db);

      await createSubscription(db, user1.id, { type: "full" });

      const user1Features = await getAllowedFeaturesForUser(user1.id);
      const user2Features = await getAllowedFeaturesForUser(user2.id);

      expect(user1Features).toEqual({
        summary: true,
        tts: true,
      });

      expect(user2Features).toEqual({
        summary: false,
        tts: false,
      });
    });

    it("should handle user with no subscriptions at all", async () => {
      const user = await createUser(db);

      const features = await getAllowedFeaturesForUser(user.id);

      expect(features).toEqual({
        summary: false,
        tts: false,
      });
    });

    it("should handle user with only expired subscriptions", async () => {
      const user = await createUser(db);
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      await createSubscription(db, user.id, {
        type: "full",
        expiresAt: lastWeek,
      });

      await createSubscription(db, user.id, {
        type: "lite",
        expiresAt: lastMonth,
      });

      const features = await getAllowedFeaturesForUser(user.id);

      expect(features).toEqual({
        summary: false,
        tts: false,
      });
    });

    it("should handle non-existent user without throwing", async () => {
      const features = await getAllowedFeaturesForUser("non-existent-id");

      expect(features).toEqual({
        summary: false,
        tts: false,
      });
    });
  });
});
