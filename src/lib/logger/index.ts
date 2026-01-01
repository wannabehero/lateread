import { getContext } from "hono/context-storage";
import type { AppContext } from "../../types/context";
import { formatConsoleLog } from "./console";
import { formatError } from "./error";
import { getServiceMetadata } from "./metadata";
import type { BaseContext, Logger, LogLevel, LogMeta } from "./types";

export type { Logger };

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

/**
 * Creates a logger instance with optional base context.
 * Base context is automatically included in all log messages from this logger.
 *
 * @param baseContext - Context to include in all log messages
 * @returns Logger instance
 *
 * @example
 * // Root logger
 * const logger = createLogger();
 *
 * // Logger with service context
 * const serviceLogger = createLogger({ service: "articles" });
 *
 * // Child logger with request context
 * const reqLogger = logger.child({ reqId: "abc-123" });
 */
export function createLogger(baseContext: BaseContext = {}): Logger {
  const serviceMetadata = getServiceMetadata();

  /**
   * Internal log function that merges base context with per-call metadata.
   * Priority: call metadata > base context
   */
  const logWithContext = (
    level: LogLevel,
    message: string,
    meta?: LogMeta,
  ): void => {
    if (level === "debug" && isProd) {
      return;
    }

    // Build log object
    const logObject: Record<string, unknown> = {
      level,
      message,
      timestamp: new Date().toISOString(),

      ...baseContext,
      service: serviceMetadata,
    };

    // Process and merge per-call metadata (overrides base context)
    if (meta) {
      const { error, ...rest } = meta;

      // Special handling for error property
      if (error !== undefined) {
        logObject.error = formatError(error);
      }

      // Spread remaining metadata (overrides base context)
      Object.assign(logObject, rest);
    }

    const output =
      isProd || isTest
        ? JSON.stringify(logObject) // Single-line JSON for production and test
        : formatConsoleLog(logObject); // Colorful log for development

    // Use appropriate console method
    if (level === "error" || level === "warn") {
      console.error(output);
    } else {
      console.log(output);
    }
  };

  return {
    context: baseContext,
    child: (additionalContext: Record<string, unknown>) =>
      createLogger({ ...baseContext, ...additionalContext }),
    debug: (message: string, meta?: LogMeta) =>
      logWithContext("debug", message, meta),
    info: (message: string, meta?: LogMeta) =>
      logWithContext("info", message, meta),
    warn: (message: string, meta?: LogMeta) =>
      logWithContext("warn", message, meta),
    error: (message: string, meta?: LogMeta) =>
      logWithContext("error", message, meta),
  };
}

/**
 * Root logger instance with no base context.
 * Use this for general application logging or as the base for child loggers.
 *
 * Usage:
 * ```typescript
 * logger.info("User logged in", { userId: "123", method: "telegram" });
 * logger.error("Failed to process article", { articleId: "abc", error: err });
 * logger.warn("API rate limit approaching", { remaining: 10, threshold: 100 });
 * logger.debug("Cache operation", { operation: "hit", key: "article:123" });
 * ```
 *
 * Guidelines:
 * - Always use static, non-templated messages (first argument)
 * - Include dynamic data in the metadata object (second argument)
 * - For errors, pass the error object in meta: { error: err }
 * - Debug logs are automatically filtered out in production
 */
export const defaultLogger = createLogger();

/**
 * Gets the logger instance from Hono context.
 * Falls back to root logger if called outside request context.
 *
 * Supports two calling patterns:
 * 1. With context: `getLogger(c)` - explicitly pass context
 * 2. Without context: `getLogger()` - uses context storage (requires contextStorage middleware)
 *
 * @param c - Optional Hono context
 * @returns Logger instance (request-scoped if available, root otherwise)
 *
 * @example
 * ```typescript
 * import { getLogger } from "../lib/logger";
 *
 * // In route handlers (explicit context)
 * app.get("/articles", async (c) => {
 *   const log = getLogger(c);
 *   log.info("Fetching articles", { filter: "unread" });
 *   return c.json({ articles: [] });
 * });
 *
 * // In services or anywhere (using context storage)
 * async function processArticle(articleId: string) {
 *   const log = getLogger();
 *   log.info("Processing article", { articleId });
 * }
 * ```
 */
export function getLogger(c?: {
  get(key: "logger"): Logger | undefined;
}): Logger {
  // If context provided, use it
  if (c) {
    return c.get("logger") ?? defaultLogger;
  }

  // Try to get context from context storage
  // Note: This requires contextStorage middleware to be enabled
  try {
    const ctx = getContext<AppContext>();
    return ctx.get("logger") ?? defaultLogger;
  } catch {
    // Context storage not available or outside request context
    return defaultLogger;
  }
}
