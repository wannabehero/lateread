import { Cron } from "croner";
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

  // 2. Cache Cleanup - daily at 3am
  new Cron("0 3 * * *", async () => {
    logger.info("Running cache cleanup...");
    await cleanupOldCache();
  });
  logger.info("Registered cron: Cache cleanup (daily at 3am)");

  // 3. Auth Token Cleanup - hourly
  new Cron("0 * * * *", async () => {
    logger.info("Running auth token cleanup...");
    const count = await cleanupExpiredTokens();
    logger.info(`Cleaned up ${count} expired auth tokens`);
  });
  logger.info("Registered cron: Auth token cleanup (hourly)");

  logger.info("All cron jobs started successfully");
}
