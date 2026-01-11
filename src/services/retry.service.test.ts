import { beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { eq } from "drizzle-orm";
import { db, resetDatabase } from "../../test/bootstrap";
import { createUser } from "../../test/fixtures";
import { articles } from "../db/schema";
import { markArticleAsError } from "./retry.service";

describe("retry.service", () => {
  const NOW = new Date("2024-06-15T12:00:00Z");

  beforeEach(() => {
    setSystemTime(NOW);
    resetDatabase();
  });

  describe("markArticleAsError", () => {
    it("should set status to error", async () => {
      const user = await createUser(db);

      const [article] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/failed",
          status: "failed",
        })
        .returning();

      if (!article) throw new Error("Failed to create article");

      await markArticleAsError(article.id, "Test error message");

      const [updated] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updated?.status).toBe("error");
    });

    it("should set lastError message", async () => {
      const user = await createUser(db);

      const [article] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/failed",
          status: "failed",
        })
        .returning();

      if (!article) throw new Error("Failed to create article");

      await markArticleAsError(article.id, "Max retry attempts exceeded");

      const [updated] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updated?.lastError).toBe("Max retry attempts exceeded");
    });

    it("should update updatedAt timestamp", async () => {
      const user = await createUser(db);

      const oldDate = new Date("2024-06-01T12:00:00Z");
      const [article] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/failed",
          status: "failed",
          updatedAt: oldDate,
        })
        .returning();

      if (!article) throw new Error("Failed to create article");

      await markArticleAsError(article.id, "Error message");

      const [updated] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));

      expect(updated?.updatedAt).not.toEqual(oldDate);
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });
});
