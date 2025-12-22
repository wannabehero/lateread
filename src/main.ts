// IMPORTANT: Config must be imported FIRST before any other modules
import { config } from "./lib/config";

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { registerHandlers } from "./bot/handlers";
import { bot, setupBot, startBot, stopBot } from "./bot/index";
import { runMigrations } from "./lib/db";
import apiRoutes from "./routes/api";
import articlesRoutes from "./routes/articles";
import authRoutes from "./routes/auth";

console.log("Starting lateread...");
console.log(`Environment: ${config.NODE_ENV}`);
console.log(`Port: ${config.PORT}`);

// Run database migrations
runMigrations();

// Create Hono app
const app = new Hono();

// Request logger
app.use("*", logger());

// Serve static files from public directory
app.use("/public/*", serveStatic({ root: "./" }));

// Register routes
app.route("/", authRoutes);
app.route("/", articlesRoutes);
app.route("/", apiRoutes);

// Setup and start Telegram bot
setupBot();
registerHandlers(bot);

// Start bot polling in background
startBot().catch((error) => {
  console.error("Failed to start bot:", error);
  process.exit(1);
});

// Start HTTP server
const server = Bun.serve({
  port: config.PORT,
  fetch: app.fetch,
});

console.log(`Server running at http://localhost:${config.PORT}`);
console.log(`Telegram bot: @${config.BOT_USERNAME}`);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await stopBot();
  server.stop();
  process.exit(0);
});
