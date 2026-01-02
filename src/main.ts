// biome-ignore assist/source/organizeImports: Config must be imported FIRST before any other modules
import { config } from "./lib/config";

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { requestId } from "hono/request-id";
import { startBot, stopBot } from "./bot/index";
import { startCrons } from "./cron";
import { runMigrations } from "./lib/db";
import { defaultLogger } from "./lib/logger";
import { errorHandler } from "./middleware/errorHandler";
import { loggerMiddleware } from "./middleware/logger";
import { corsMiddleware, securityHeaders } from "./middleware/security";
import apiRoutes from "./routes/api";
import articlesRoutes from "./routes/articles";
import authRoutes from "./routes/auth";
import healthRoutes from "./routes/health";
import homeRoutes from "./routes/home";
import searchRoutes from "./routes/search";
import type { AppContext } from "./types/context";

const logger = defaultLogger.child({ module: "main" });

// Run database migrations
runMigrations();

// Create Hono app with typed context
const app = new Hono<AppContext>();

// Security middleware (must be before routes)
app.use("*", corsMiddleware);
app.use("*", securityHeaders);

// Request tracking and logging
app.use("*", requestId());
app.use("*", loggerMiddleware);

// Serve static files from public directory
app.use("/public/*", serveStatic({ root: "./" }));

// Register routes
app.route("/", homeRoutes);
app.route("/", authRoutes);
app.route("/", articlesRoutes);
app.route("/", searchRoutes);
app.route("/", apiRoutes);
app.route("/", healthRoutes);

app.onError(errorHandler);

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
  server.stop();
  process.exit(0);
});
