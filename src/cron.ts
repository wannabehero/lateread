import { cleanupOldCache } from "./lib/content-cache";
import { defaultLogger } from "./lib/logger";
import { cleanupExpiredTokens } from "./services/auth.service";

const logger = defaultLogger.child({ module: "cron" });

/**
 * Centralized cron job registry
 * All scheduled tasks are defined here
 */
export function startCrons(): void {
  logger.info("Starting cron jobs...");

  // Cache Cleanup - daily at 3am
  Bun.cron("0 3 * * *", async () => {
    logger.info("Running cache cleanup...");
    await cleanupOldCache();
  });
  logger.info("Registered cron: Cache cleanup (daily at 3am)");

  // Auth Token Cleanup - hourly
  Bun.cron("0 * * * *", async () => {
    logger.info("Running auth token cleanup...");
    const count = await cleanupExpiredTokens();
    logger.info(`Cleaned up ${count} expired auth tokens`);
  });
  logger.info("Registered cron: Auth token cleanup (hourly)");

  logger.info("All cron jobs started successfully");
}
