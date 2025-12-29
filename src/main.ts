// biome-ignore assist/source/organizeImports: Config must be imported FIRST before any other modules
import { config } from "./lib/config";

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { contextStorage } from "hono/context-storage";
import { requestId } from "hono/request-id";
import { startBot, stopBot } from "./bot/index";
import { startCrons } from "./cron";
import { runMigrations } from "./lib/db";
import { errorHandler } from "./middleware/errorHandler";
import { loggerMiddleware } from "./middleware/logger";
import apiRoutes from "./routes/api";
import articlesRoutes from "./routes/articles";
import authRoutes from "./routes/auth";
import healthRoutes from "./routes/health";
import homeRoutes from "./routes/home";
import searchRoutes from "./routes/search";
import type { AppContext } from "./types/context";

console.log("Starting lateread...");
console.log(`Environment: ${config.NODE_ENV}`);
console.log(`Port: ${config.PORT}`);

// Run database migrations
runMigrations();

// Create Hono app with typed context
const app = new Hono<AppContext>();

// Context storage middleware (enables getContext() anywhere)
app.use("*", contextStorage());

// Request ID middleware (generates UUID per request)
app.use("*", requestId());

// Logger middleware (creates request-scoped logger with requestId)
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
  console.error("Failed to start bot:", error);
  process.exit(1);
});

// Start HTTP server
const server = Bun.serve({
  port: config.PORT,
  fetch: app.fetch,
  idleTimeout: 120, // 2 minutes for long-running LLM requests
});

console.log(`Server running at http://localhost:${config.PORT}`);
console.log(`Telegram bot: @${config.BOT_USERNAME}`);

// Start cron jobs
startCrons();

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await stopBot();
  server.stop();
  process.exit(0);
});
