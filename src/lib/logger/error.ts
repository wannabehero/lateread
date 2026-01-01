import type { ErrorObject } from "./types";

/**
 * Formats an unknown error into a structured error object.
 * Extracts type (constructor name), message, and stack trace if available.
 */
export function formatError(error: unknown): ErrorObject {
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
