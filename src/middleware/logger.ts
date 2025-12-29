import type { Context, Next } from "hono";
import { logger } from "../lib/logger";
import type { AppContext } from "../types/context";

/**
 * Logger middleware that creates request-scoped logger with reqId.
 *
 * Sets up a child logger with a unique request ID in context for use in handlers.
 * The reqId is automatically included in all log messages from the request-scoped logger.
 *
 * Usage:
 * ```typescript
 * import { loggerMiddleware } from "./middleware/logger";
 *
 * app.use("*", loggerMiddleware);
 * ```
 *
 * In handlers:
 * ```typescript
 * import { getLogger } from "../lib/logger";
 *
 * app.get("/articles", async (c) => {
 *   const log = getLogger(c);
 *   log.info("Fetching articles"); // Includes reqId automatically
 *   return c.json({ articles: [] });
 * });
 * ```
 */
export async function loggerMiddleware(
  c: Context<AppContext>,
  next: Next,
): Promise<void> {
  // Generate unique request ID
  const reqId = crypto.randomUUID();

  // Create child logger with reqId
  const requestLogger = logger.child({ reqId });

  // Store in context for handlers to access via getLogger(c)
  c.set("logger", requestLogger);

  await next();
}
