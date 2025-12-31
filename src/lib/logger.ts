import { getContext } from "hono/context-storage";
import type { AppContext } from "../types/context";
import { getServiceMetadata } from "./metadata";

const isProd = process.env.NODE_ENV === "production";

/**
 * Log levels in order of severity
 */
type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Metadata object that can be passed to logger methods.
 * For warn/error levels, include an `error` property with the unknown error object.
 */
interface LogMeta {
  [key: string]: unknown;
  error?: unknown;
}

/**
 * Formatted error object with extracted properties
 */
interface ErrorObject {
  type: string;
  message: string;
  stack?: string;
}

/**
 * Formats an unknown error into a structured error object.
 * Extracts type (constructor name), message, and stack trace if available.
 */
function formatError(error: unknown): ErrorObject {
  if (error instanceof Error) {
    return {
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
    };
  }

  // Handle non-Error objects
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    return {
      type: err.name ? String(err.name) : "Unknown",
      message: err.message ? String(err.message) : JSON.stringify(error),
      stack: err.stack ? String(err.stack) : undefined,
    };
  }

  // Primitive or null
  return {
    type: typeof error,
    message: String(error),
  };
}

/**
 * Logger interface with support for child loggers.
 * Child loggers inherit context from parent and merge with per-call metadata.
 */
export interface Logger {
  /**
   * Base context that is automatically included in all log messages.
   * Merged with per-call metadata (call metadata takes priority).
   */
  readonly context: Record<string, unknown>;

  /**
   * Creates a child logger with additional context.
   * Child context is merged with parent context and included in all logs.
   *
   * @param additionalContext - Context to add to child logger
   * @returns New logger instance with merged context
   *
   * @example
   * const rootLogger = createLogger();
   * const reqLogger = rootLogger.child({ reqId: "abc-123" });
   * reqLogger.info("Request received"); // Includes reqId in output
   */
  child(additionalContext: Record<string, unknown>): Logger;

  /**
   * Debug level - detailed information for diagnosing issues.
   * Automatically filtered out in production.
   */
  debug(message: string, meta?: LogMeta): void;

  /**
   * Info level - general informational messages about application flow.
   */
  info(message: string, meta?: LogMeta): void;

  /**
   * Warn level - warning messages for potentially harmful situations.
   * Consider including an `error` property in meta if applicable.
   */
  warn(message: string, meta?: LogMeta): void;

  /**
   * Error level - error events that might still allow the application to continue.
   * Include an `error` property in meta with the error object.
   */
  error(message: string, meta?: LogMeta): void;
}

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
export function createLogger(
  baseContext: Record<string, unknown> = {},
): Logger {
  const metadata = getServiceMetadata();

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
    };

    // Merge base context first
    Object.assign(logObject, baseContext, {
      metadata,
    });

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

    // Format output based on environment
    const output = isProd
      ? JSON.stringify(logObject) // Single-line JSON for production
      : JSON.stringify(logObject, null, 2); // Pretty JSON for development

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
export const logger = createLogger();

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
    return c.get("logger") ?? logger;
  }

  // Try to get context from context storage
  // Note: This requires contextStorage middleware to be enabled
  try {
    const ctx = getContext<AppContext>();
    return ctx.get("logger") ?? logger;
  } catch {
    // Context storage not available or outside request context
    return logger;
  }
}
