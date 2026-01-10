// biome-ignore assist/source/organizeImports: Config must be imported FIRST before any other modules
import { config } from "./lib/config";

import { createApp } from "./app";
import { startBot, stopBot } from "./bot/index";
import { startCrons } from "./cron";
import { runMigrations } from "./lib/db";
import { defaultLogger } from "./lib/logger";
import { initQueue, stopQueue } from "./lib/queue";

const logger = defaultLogger.child({ module: "main" });

// Run database migrations
runMigrations();

// Initialize article processing queue
initQueue();

// Create Hono app with all middleware and routes
const app = createApp();

// Setup and start Telegram bot
startBot().catch((error) => {
  logger.error("Failed to start bot", { error });
  process.exit(1);
});

// Start HTTP server
const server = Bun.serve({
  port: config.PORT,
  fetch: app.fetch,
  idleTimeout: 120, // 2 minutes for long-running LLM requests
});

logger.info(`Server running at http://0.0.0.0:${config.PORT}`);
logger.info(`Telegram bot: @${config.BOT_USERNAME}`);

// Start cron jobs
startCrons();

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  await stopBot();
  await stopQueue();
  server.stop();
  process.exit(0);
});
