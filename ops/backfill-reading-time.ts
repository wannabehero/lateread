#!/usr/bin/env bun

/**
 * Backfill reading time statistics for existing articles
 *
 * This script calculates wordCount and readingTimeSeconds for all completed articles
 * that don't have these values yet. It uses cached content where available.
 *
 * Usage: bun run ops/backfill-reading-time.ts
 */

import { eq, isNull } from "drizzle-orm";
import { articles } from "../src/db/schema";
import { contentCache } from "../src/lib/content-cache";
import { db } from "../src/lib/db";
import { defaultLogger } from "../src/lib/logger";
import { calculateReadingStats } from "../src/lib/reading-time";

const logger = defaultLogger.child({ module: "backfill-reading-time" });

interface Stats {
  total: number;
  processed: number;
  skipped: number;
  failed: number;
}

async function backfillReadingTime() {
  logger.info("Starting reading time backfill");

  const stats: Stats = {
    total: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    // Find all completed articles without reading time stats
    const articlesToProcess = await db
      .select({
        id: articles.id,
        userId: articles.userId,
        title: articles.title,
        url: articles.url,
      })
      .from(articles)
      .where(eq(articles.status, "completed"))
      .where(isNull(articles.wordCount));

    stats.total = articlesToProcess.length;
    logger.info("Found articles to process", { count: stats.total });

    if (stats.total === 0) {
      logger.info("No articles to backfill");
      return;
    }

    // Process each article
    for (const [index, article] of articlesToProcess.entries()) {
      // Log progress every 10 articles
      if ((index + 1) % 10 === 0) {
        logger.info("Progress update", {
          processed: index + 1,
          total: stats.total,
          percentage: Math.round(((index + 1) / stats.total) * 100),
        });
      }

      try {
        // Try to get cached content
        const htmlContent = await contentCache.get(article.userId, article.id);

        if (!htmlContent) {
          logger.warn("No cached content found, skipping", {
            articleId: article.id,
            title: article.title || article.url,
          });
          stats.skipped++;
          continue;
        }

        // Calculate reading stats
        const readingStats = calculateReadingStats(htmlContent);

        // Update article with reading stats
        await db
          .update(articles)
          .set({
            wordCount: readingStats.wordCount,
            readingTimeSeconds: readingStats.readingTimeSeconds,
            updatedAt: new Date(),
          })
          .where(eq(articles.id, article.id));

        logger.debug("Processed article", {
          articleId: article.id,
          title: article.title || article.url,
          wordCount: readingStats.wordCount,
          readingTimeSeconds: readingStats.readingTimeSeconds,
        });

        stats.processed++;
      } catch (error) {
        logger.error("Failed to process article", {
          articleId: article.id,
          title: article.title || article.url,
          error: error instanceof Error ? error.message : String(error),
        });
        stats.failed++;
      }
    }

    // Log final summary
    logger.info("Backfill completed", {
      total: stats.total,
      processed: stats.processed,
      skipped: stats.skipped,
      failed: stats.failed,
      successRate: `${Math.round((stats.processed / stats.total) * 100)}%`,
    });
  } catch (error) {
    logger.error("Backfill failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Run the backfill
backfillReadingTime();
