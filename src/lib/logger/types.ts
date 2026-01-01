/**
 * Log levels in order of severity
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface BaseContext {
  [key: string]: unknown;

  // Reserved keys
  service?: never;
  message?: never;
}

/**
 * Metadata object that can be passed to logger methods.
 */
export interface LogMeta extends BaseContext {
  error?: unknown;
}

/**
 * Formatted error object with extracted properties
 */
export interface ErrorObject {
  type: string;
  message: string;
  stack?: string;
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
  child(additionalContext: BaseContext): Logger;

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
