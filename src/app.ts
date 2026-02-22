import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { requestId } from "hono/request-id";
import { errorHandler } from "./middleware/errorHandler";
import { loggerMiddleware } from "./middleware/logger";
import { corsMiddleware, securityHeaders } from "./middleware/security";
import { session } from "./middleware/session";
import apiRoutes from "./routes/api";
import articlesRoutes from "./routes/articles";
import authRoutes from "./routes/auth";
import healthRoutes from "./routes/health";
import homeRoutes from "./routes/home";
import loginRoutes from "./routes/login";
import searchRoutes from "./routes/search";
import ttsWsRoutes from "./routes/tts-ws";
import type { AppContext } from "./types/context";

/**
 * Create and configure the Hono application with all middleware and routes.
 * This factory function is used both in production (main.ts) and tests.
 */
export function createApp(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  // Security middleware (must be before routes)
  app.use("*", corsMiddleware);
  app.use("*", securityHeaders);

  app.use("*", requestId());
  app.use("*", loggerMiddleware);

  app.use("*", session());

  // Serve static files from public directory
  app.use("/public/*", serveStatic({ root: "./" }));

  // Register routes
  app.route("/", homeRoutes);
  app.route("/", loginRoutes);
  app.route("/", authRoutes);
  app.route("/", articlesRoutes);
  app.route("/", searchRoutes);
  app.route("/", apiRoutes);
  app.route("/", ttsWsRoutes); // WebSocket TTS endpoint
  app.route("/", healthRoutes);

  app.onError(errorHandler);

  return app;
}
