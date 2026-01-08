import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
  spyOn,
} from "bun:test";
import { eq } from "drizzle-orm";
import { db, resetDatabase } from "../../test/bootstrap";
import { createUser } from "../../test/fixtures";
import { articles } from "../db/schema";
import { config } from "../lib/config";
import * as worker from "../lib/worker";
import {
  getExhaustedArticles,
  getStuckArticles,
  markArticleAsError,
  retryFailedArticles,
} from "./retry.service";

describe("retry.service", () => {
  // Fix the current time to a known value for consistent testing
  const NOW = new Date("2024-06-15T12:00:00Z");
  const OLD = new Date("2024-06-15T11:54:00Z"); // 6 minutes ago (past delay)
  const RECENT = new Date("2024-06-15T11:58:00Z"); // 2 minutes ago (within delay)

  beforeEach(() => {
    setSystemTime(NOW);
    resetDatabase();
  });

  afterEach(() => {
    setSystemTime(); // Reset system time
  });

  describe("getStuckArticles", () => {
    it("should return pending articles older than RETRY_DELAY_MINUTES", async () => {
      const user = await createUser(db);

      const [article] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/pending",
          status: "pending",
          processingAttempts: 1,
          updatedAt: OLD,
        })
        .returning();

      const stuck = await getStuckArticles();

      expect(stuck).toHaveLength(1);
      expect(stuck[0]?.id).toBe(article?.id);
      expect(stuck[0]?.status).toBe("pending");
    });

    it("should return processing articles older than RETRY_DELAY_MINUTES", async () => {
      const user = await createUser(db);

      const [article] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/processing",
          status: "processing",
          processingAttempts: 1,
          updatedAt: OLD,
        })
        .returning();

      const stuck = await getStuckArticles();

      expect(stuck).toHaveLength(1);
      expect(stuck[0]?.id).toBe(article?.id);
      expect(stuck[0]?.status).toBe("processing");
    });

    it("should return failed articles older than RETRY_DELAY_MINUTES", async () => {
      const user = await createUser(db);

      const [article] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/failed",
          status: "failed",
          processingAttempts: 2,
          updatedAt: OLD,
        })
        .returning();

      const stuck = await getStuckArticles();

      expect(stuck).toHaveLength(1);
      expect(stuck[0]?.id).toBe(article?.id);
      expect(stuck[0]?.status).toBe("failed");
    });

    it("should NOT return recently updated articles (within retry delay)", async () => {
      const user = await createUser(db);

      await db.insert(articles).values({
        userId: user.id,
        url: "https://example.com/recent",
        status: "pending",
        processingAttempts: 1,
        updatedAt: RECENT,
      });

      const stuck = await getStuckArticles();

      expect(stuck).toHaveLength(0);
    });

    it("should NOT return articles with processingAttempts >= MAX_RETRY_ATTEMPTS", async () => {
      const user = await createUser(db);

      await db.insert(articles).values({
        userId: user.id,
        url: "https://example.com/exhausted",
        status: "pending",
        processingAttempts: config.MAX_RETRY_ATTEMPTS,
        updatedAt: OLD,
      });

      const stuck = await getStuckArticles();

      expect(stuck).toHaveLength(0);
    });

    it("should NOT return completed articles", async () => {
      const user = await createUser(db);

      await db.insert(articles).values({
        userId: user.id,
        url: "https://example.com/completed",
        status: "completed",
        processingAttempts: 1,
        updatedAt: OLD,
      });

      const stuck = await getStuckArticles();

      expect(stuck).toHaveLength(0);
    });

    it("should NOT return error articles", async () => {
      const user = await createUser(db);

      await db.insert(articles).values({
        userId: user.id,
        url: "https://example.com/error",
        status: "error",
        processingAttempts: 5,
        updatedAt: OLD,
      });

      const stuck = await getStuckArticles();

      expect(stuck).toHaveLength(0);
    });

    it("should return empty array when no stuck articles", async () => {
      const stuck = await getStuckArticles();

      expect(stuck).toHaveLength(0);
    });

    it("should return multiple stuck articles from different statuses", async () => {
      const user = await createUser(db);

      await db.insert(articles).values([
        {
          userId: user.id,
          url: "https://example.com/pending",
          status: "pending",
          processingAttempts: 0,
          updatedAt: OLD,
        },
        {
          userId: user.id,
          url: "https://example.com/processing",
          status: "processing",
          processingAttempts: 1,
          updatedAt: OLD,
        },
        {
          userId: user.id,
          url: "https://example.com/failed",
          status: "failed",
          processingAttempts: 2,
          updatedAt: OLD,
        },
      ]);

      const stuck = await getStuckArticles();

      expect(stuck).toHaveLength(3);
    });
  });

  describe("getExhaustedArticles", () => {
    it("should return pending articles with processingAttempts >= MAX_RETRY_ATTEMPTS", async () => {
      const user = await createUser(db);

      const [article] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/pending",
          status: "pending",
          processingAttempts: config.MAX_RETRY_ATTEMPTS,
        })
        .returning();

      const exhausted = await getExhaustedArticles();

      expect(exhausted).toHaveLength(1);
      expect(exhausted[0]?.id).toBe(article?.id);
      expect(exhausted[0]?.processingAttempts).toBe(config.MAX_RETRY_ATTEMPTS);
    });

    it("should return processing articles with processingAttempts >= MAX_RETRY_ATTEMPTS", async () => {
      const user = await createUser(db);

      const [article] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/processing",
          status: "processing",
          processingAttempts: config.MAX_RETRY_ATTEMPTS + 1,
        })
        .returning();

      const exhausted = await getExhaustedArticles();

      expect(exhausted).toHaveLength(1);
      expect(exhausted[0]?.id).toBe(article?.id);
    });

    it("should return failed articles with processingAttempts >= MAX_RETRY_ATTEMPTS", async () => {
      const user = await createUser(db);

      const [article] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/failed",
          status: "failed",
          processingAttempts: config.MAX_RETRY_ATTEMPTS,
        })
        .returning();

      const exhausted = await getExhaustedArticles();

      expect(exhausted).toHaveLength(1);
      expect(exhausted[0]?.id).toBe(article?.id);
    });

    it("should NOT return articles with fewer than MAX_RETRY_ATTEMPTS", async () => {
      const user = await createUser(db);

      await db.insert(articles).values({
        userId: user.id,
        url: "https://example.com/pending",
        status: "pending",
        processingAttempts: config.MAX_RETRY_ATTEMPTS - 1,
      });

      const exhausted = await getExhaustedArticles();

      expect(exhausted).toHaveLength(0);
    });

    it("should NOT return completed articles (even with high attempts)", async () => {
      const user = await createUser(db);

      await db.insert(articles).values({
        userId: user.id,
        url: "https://example.com/completed",
        status: "completed",
        processingAttempts: config.MAX_RETRY_ATTEMPTS + 5,
      });

      const exhausted = await getExhaustedArticles();

      expect(exhausted).toHaveLength(0);
    });

    it("should NOT return error articles (already marked as failed)", async () => {
      const user = await createUser(db);

      await db.insert(articles).values({
        userId: user.id,
        url: "https://example.com/error",
        status: "error",
        processingAttempts: config.MAX_RETRY_ATTEMPTS,
      });

      const exhausted = await getExhaustedArticles();

      expect(exhausted).toHaveLength(0);
    });

    it("should return empty array when no exhausted articles", async () => {
      const exhausted = await getExhaustedArticles();

      expect(exhausted).toHaveLength(0);
    });

    it("should return multiple exhausted articles", async () => {
      const user = await createUser(db);

      await db.insert(articles).values([
        {
          userId: user.id,
          url: "https://example.com/pending",
          status: "pending",
          processingAttempts: config.MAX_RETRY_ATTEMPTS,
        },
        {
          userId: user.id,
          url: "https://example.com/processing",
          status: "processing",
          processingAttempts: config.MAX_RETRY_ATTEMPTS,
        },
        {
          userId: user.id,
          url: "https://example.com/failed",
          status: "failed",
          processingAttempts: config.MAX_RETRY_ATTEMPTS + 2,
        },
      ]);

      const exhausted = await getExhaustedArticles();

      expect(exhausted).toHaveLength(3);
    });
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

  describe("retryFailedArticles", () => {
    let spySpawnArticleWorker: ReturnType<
      typeof spyOn<typeof worker, "spawnArticleWorker">
    >;

    beforeEach(() => {
      spySpawnArticleWorker = spyOn(
        worker,
        "spawnArticleWorker",
      ).mockImplementation(() => {});
    });

    afterEach(() => {
      spySpawnArticleWorker.mockRestore();
    });

    it("should spawn workers for all stuck articles", async () => {
      const user = await createUser(db);

      const [article1] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/pending",
          status: "pending",
          processingAttempts: 1,
          updatedAt: OLD,
        })
        .returning();

      const [article2] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/processing",
          status: "processing",
          processingAttempts: 2,
          updatedAt: OLD,
        })
        .returning();

      await retryFailedArticles();

      expect(spySpawnArticleWorker).toHaveBeenCalledTimes(2);
      expect(spySpawnArticleWorker).toHaveBeenCalledWith({
        articleId: article1?.id,
      });
      expect(spySpawnArticleWorker).toHaveBeenCalledWith({
        articleId: article2?.id,
      });
    });

    it("should mark all exhausted articles as error", async () => {
      const user = await createUser(db);

      const [article1] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/exhausted1",
          status: "pending",
          processingAttempts: config.MAX_RETRY_ATTEMPTS,
        })
        .returning();

      const [article2] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/exhausted2",
          status: "failed",
          processingAttempts: config.MAX_RETRY_ATTEMPTS,
        })
        .returning();

      await retryFailedArticles();

      const [updated1] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article1?.id ?? ""));

      const [updated2] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article2?.id ?? ""));

      expect(updated1?.status).toBe("error");
      expect(updated1?.lastError).toBe("Max retry attempts exceeded");
      expect(updated2?.status).toBe("error");
      expect(updated2?.lastError).toBe("Max retry attempts exceeded");
    });

    it("should handle case with no stuck or exhausted articles", async () => {
      await retryFailedArticles();

      expect(spySpawnArticleWorker).not.toHaveBeenCalled();
    });

    it("should handle mixed scenario with both stuck and exhausted articles", async () => {
      const user = await createUser(db);

      // Stuck article
      const [stuckArticle] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/stuck",
          status: "pending",
          processingAttempts: 1,
          updatedAt: OLD,
        })
        .returning();

      // Exhausted article
      const [exhaustedArticle] = await db
        .insert(articles)
        .values({
          userId: user.id,
          url: "https://example.com/exhausted",
          status: "failed",
          processingAttempts: config.MAX_RETRY_ATTEMPTS,
        })
        .returning();

      await retryFailedArticles();

      // Should spawn worker for stuck article
      expect(spySpawnArticleWorker).toHaveBeenCalledTimes(1);
      expect(spySpawnArticleWorker).toHaveBeenCalledWith({
        articleId: stuckArticle?.id,
      });

      // Should mark exhausted article as error
      const [updated] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, exhaustedArticle?.id ?? ""));

      expect(updated?.status).toBe("error");
      expect(updated?.lastError).toBe("Max retry attempts exceeded");
    });
  });
});
