import type { Context, Next } from "hono";
import { logger } from "../lib/logger";
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

  // Create child logger with requestId
  const requestLogger = logger.child({ reqId });

  // Store in context for handlers to access via getLogger(c)
  c.set("logger", requestLogger);

  await next();
}
