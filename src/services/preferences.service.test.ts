import { beforeEach, describe, expect, it } from "bun:test";
import { db, resetDatabase } from "../../test/bootstrap";
import { createUser } from "../../test/fixtures";
import { NotFoundError } from "../lib/errors";
import {
  getReaderPreferences,
  getUserPreferences,
  updateReaderPreferences,
} from "./preferences.service";

describe("preferences.service", () => {
  beforeEach(() => {
    resetDatabase();
  });

  describe("getUserPreferences", () => {
    it("should return empty object for user with no preferences", async () => {
      const user = await createUser(db);

      const prefs = await getUserPreferences(user.id);

      expect(prefs).toEqual({});
    });

    it("should return parsed preferences for user", async () => {
      const user = await createUser(db, {
        preferences: JSON.stringify({
          reader: { fontSize: 18, theme: "dark" },
        }),
      });

      const prefs = await getUserPreferences(user.id);

      expect(prefs).toEqual({
        reader: { fontSize: 18, theme: "dark" },
      });
    });

    it("should throw NotFoundError for non-existent user", async () => {
      expect(async () => {
        await getUserPreferences("non-existent-id");
      }).toThrow(NotFoundError);
    });

    it("should return empty object for invalid JSON", async () => {
      const user = await createUser(db, {
        preferences: "invalid-json",
      });

      const prefs = await getUserPreferences(user.id);

      expect(prefs).toEqual({});
    });

    it("should handle complex nested preferences", async () => {
      const complexPrefs = {
        reader: {
          fontSize: 16,
          theme: "light",
        },
        notifications: {
          email: true,
          push: false,
        },
      };

      const user = await createUser(db, {
        preferences: JSON.stringify(complexPrefs),
      });

      const prefs = await getUserPreferences(user.id);

      expect(prefs).toEqual(complexPrefs);
    });
  });

  describe("getReaderPreferences", () => {
    it("should return default reader preferences for user with no preferences", async () => {
      const user = await createUser(db);

      const readerPrefs = await getReaderPreferences(user.id);

      expect(readerPrefs).toEqual({
        fontSize: 18,
        fontFamily: "sans",
      });
    });

    it("should merge user preferences with defaults", async () => {
      const user = await createUser(db, {
        preferences: JSON.stringify({
          reader: { fontSize: 20 },
        }),
      });

      const readerPrefs = await getReaderPreferences(user.id);

      expect(readerPrefs).toEqual({
        fontSize: 20,
        fontFamily: "sans",
      });
    });

    it("should override all default values when all are specified", async () => {
      const customPrefs = {
        fontSize: 22,
        fontFamily: "serif" as const,
      };

      const user = await createUser(db, {
        preferences: JSON.stringify({
          reader: customPrefs,
        }),
      });

      const readerPrefs = await getReaderPreferences(user.id);

      expect(readerPrefs).toEqual(customPrefs);
    });

    it("should only use reader preferences, ignoring other preference types", async () => {
      const user = await createUser(db, {
        preferences: JSON.stringify({
          reader: { fontSize: 22 },
          notifications: { email: true },
        }),
      });

      const readerPrefs = await getReaderPreferences(user.id);

      expect(readerPrefs).toEqual({
        fontSize: 22,
        fontFamily: "sans",
      });
    });

    it("should throw NotFoundError for non-existent user", async () => {
      expect(async () => {
        await getReaderPreferences("non-existent-id");
      }).toThrow(NotFoundError);
    });
  });

  describe("updateReaderPreferences", () => {
    it("should update reader preferences for user with no existing preferences", async () => {
      const user = await createUser(db);

      await updateReaderPreferences(user.id, {
        fontSize: 20,
        fontFamily: "serif",
      });

      const readerPrefs = await getReaderPreferences(user.id);

      expect(readerPrefs.fontSize).toBe(20);
      expect(readerPrefs.fontFamily).toBe("serif");
    });

    it("should merge with existing reader preferences", async () => {
      const user = await createUser(db, {
        preferences: JSON.stringify({
          reader: { fontSize: 16, fontFamily: "serif" },
        }),
      });

      await updateReaderPreferences(user.id, {
        fontFamily: "sans",
      });

      const readerPrefs = await getReaderPreferences(user.id);

      expect(readerPrefs.fontSize).toBe(16); // Should keep existing value
      expect(readerPrefs.fontFamily).toBe("sans"); // Should update to new value
    });

    it("should preserve non-reader preferences", async () => {
      const user = await createUser(db, {
        preferences: JSON.stringify({
          reader: { fontSize: 16 },
          notifications: { email: true },
        }),
      });

      await updateReaderPreferences(user.id, {
        fontSize: 20,
      });

      const allPrefs = await getUserPreferences(user.id);

      expect(allPrefs.reader?.fontSize).toBe(20);
      expect(allPrefs.notifications).toEqual({ email: true });
    });

    it("should update multiple reader preference fields at once", async () => {
      const user = await createUser(db);

      await updateReaderPreferences(user.id, {
        fontSize: 22,
        fontFamily: "serif",
      });

      const readerPrefs = await getReaderPreferences(user.id);

      expect(readerPrefs).toEqual({
        fontSize: 22,
        fontFamily: "serif",
      });
    });

    it("should allow updating a single preference field", async () => {
      const user = await createUser(db, {
        preferences: JSON.stringify({
          reader: {
            fontSize: 16,
            fontFamily: "serif",
          },
        }),
      });

      await updateReaderPreferences(user.id, {
        fontSize: 24,
      });

      const readerPrefs = await getReaderPreferences(user.id);

      expect(readerPrefs.fontSize).toBe(24);
      expect(readerPrefs.fontFamily).toBe("serif");
    });

    it("should handle updating preferences multiple times", async () => {
      const user = await createUser(db);

      await updateReaderPreferences(user.id, { fontSize: 16 });
      await updateReaderPreferences(user.id, { fontFamily: "new-york" });
      await updateReaderPreferences(user.id, { fontSize: 20 });

      const readerPrefs = await getReaderPreferences(user.id);

      expect(readerPrefs.fontSize).toBe(20);
      expect(readerPrefs.fontFamily).toBe("new-york");
    });

    it("should throw NotFoundError for non-existent user", async () => {
      expect(async () => {
        await updateReaderPreferences("non-existent-id", { fontSize: 20 });
      }).toThrow(NotFoundError);
    });
  });
});
