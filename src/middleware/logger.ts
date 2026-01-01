import type { Context, Next } from "hono";
import { defaultLogger } from "../lib/logger";
import type { AppContext } from "../types/context";

/**
 * Logger middleware that creates request-scoped logger with requestId.
 *
 * Sets up a child logger with request ID from Hono's requestId middleware.
 * The requestId is automatically included in all log messages from the request-scoped logger.
 *
 * **IMPORTANT**: Must be applied AFTER contextStorage() and requestId() middleware.
 *
 * Usage:
 * ```typescript
 * import { contextStorage } from "hono/context-storage";
 * import { requestId } from "hono/request-id";
 * import { loggerMiddleware } from "./middleware/logger";
 *
 * app.use("*", contextStorage());
 * app.use("*", requestId());
 * app.use("*", loggerMiddleware);
 * ```
 *
 * In handlers:
 * ```typescript
 * import { getLogger } from "../lib/logger";
 *
 * app.get("/articles", async (c) => {
 *   const log = getLogger(c);
 *   log.info("Fetching articles"); // Includes requestId automatically
 *   return c.json({ articles: [] });
 * });
 * ```
 */
export async function loggerMiddleware(
  c: Context<AppContext>,
  next: Next,
): Promise<void> {
  // Get requestId from Hono's requestId middleware
  const reqId = c.get("requestId");

  const logger = defaultLogger.child({ module: "app", reqId });
  c.set("logger", logger);

  const startTime = Date.now();

  try {
    await next();
  } finally {
    const duration = Date.now() - startTime;
    logger.info(`${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`);
  }
}
