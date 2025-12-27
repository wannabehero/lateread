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
 * Core logging function that formats and outputs log messages.
 *
 * @param level - Log level (debug, info, warn, error)
 * @param message - Static, non-templated message string
 * @param meta - Optional metadata object with additional context
 */
function log(level: LogLevel, message: string, meta?: LogMeta): void {
  const isProd = process.env.NODE_ENV === "production";

  // Skip debug logs in production
  if (level === "debug" && isProd) {
    return;
  }

  // Build log object
  const logObject: Record<string, unknown> = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  // Process metadata
  if (meta) {
    const { error, ...rest } = meta;

    // Special handling for error property
    if (error !== undefined) {
      logObject.error = formatError(error);
    }

    // Spread remaining metadata
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
}

/**
 * Structured logger with support for debug, info, warn, and error levels.
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
export const logger = {
  /**
   * Debug level - detailed information for diagnosing issues.
   * Automatically filtered out in production.
   */
  debug: (message: string, meta?: LogMeta) => log("debug", message, meta),

  /**
   * Info level - general informational messages about application flow.
   */
  info: (message: string, meta?: LogMeta) => log("info", message, meta),

  /**
   * Warn level - warning messages for potentially harmful situations.
   * Consider including an `error` property in meta if applicable.
   */
  warn: (message: string, meta?: LogMeta) => log("warn", message, meta),

  /**
   * Error level - error events that might still allow the application to continue.
   * Include an `error` property in meta with the error object.
   */
  error: (message: string, meta?: LogMeta) => log("error", message, meta),
};
