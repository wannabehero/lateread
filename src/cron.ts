import { Cron } from "croner";
import { cleanupExpiredTokens } from "./lib/auth";
import { cleanupOldCache } from "./lib/content-cache";
import { retryFailedArticles } from "./workers/retry";

/**
 * Centralized cron job registry
 * All scheduled tasks are defined here
 */
export function startCrons(): void {
  console.log("Starting cron jobs...");

  // 1. Retry Failed Articles - every 5 minutes
  new Cron("*/5 * * * *", async () => {
    console.log("[Cron] Running retry job...");
    await retryFailedArticles();
  });
  console.log("Registered cron: Retry failed articles (every 5 minutes)");

  // 2. Cache Cleanup - daily at 3am
  new Cron("0 3 * * *", async () => {
    console.log("[Cron] Running cache cleanup...");
    await cleanupOldCache();
  });
  console.log("Registered cron: Cache cleanup (daily at 3am)");

  // 3. Auth Token Cleanup - hourly
  new Cron("0 * * * *", async () => {
    console.log("[Cron] Running auth token cleanup...");
    const count = await cleanupExpiredTokens();
    console.log(`[Cron] Cleaned up ${count} expired auth tokens`);
  });
  console.log("Registered cron: Auth token cleanup (hourly)");

  console.log("All cron jobs started successfully");
}
