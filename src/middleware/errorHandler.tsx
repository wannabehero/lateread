import type { Context, ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ErrorPage } from "../components/errors/ErrorPage";
import { ErrorPartial } from "../components/errors/ErrorPartial";
import { AppError, InternalError } from "../lib/errors";
import type { AppContext } from "../types/context";
import { renderWithLayout } from "../routes/utils/render";

function formatErrorResponse(error: AppError) {
  return {
    error: error.message,
    statusCode: error.statusCode,
    ...(error.context && { context: error.context }),
  };
}

/**
 * Detect request type for appropriate error response
 *
 * Returns:
 * - "htmx": HTMX partial request (HX-Request header)
 * - "json": JSON API request (Accept header or /api/ path)
 * - "html": Full HTML page (browser navigation)
 */
function getRequestType(c: Context<AppContext>): "htmx" | "json" | "html" {
  // Check if HTMX request
  if (c.req.header("hx-request") === "true") {
    return "htmx";
  }

  // Check if JSON API request (Accept header or /api/ path)
  const acceptsJson = c.req.header("accept")?.includes("application/json");
  const isApiRoute = c.req.path.startsWith("/api/");

  if (acceptsJson || isApiRoute) {
    return "json";
  }

  // Default to full HTML page
  return "html";
}

/**
 * Global error handling middleware
 *
 * Catches all unhandled errors and returns appropriate responses:
 * - HTMX requests → ErrorPartial (inline error)
 * - JSON API requests → Structured JSON
 * - Browser requests → ErrorPage (full page with Layout)
 */
export const errorHandler: ErrorHandler = (
  err: Error,
  c: Context<AppContext>,
) => {
  // Convert unknown errors to AppError
  const error =
    err instanceof AppError
      ? err
      : new InternalError("An unexpected error occurred", {
          originalError: err.message,
        });

  // Log error with context
  const userId = c.get("userId");
  const logContext = {
    statusCode: error.statusCode,
    path: c.req.path,
    method: c.req.method,
    userId,
    error,
    ...(error.context || {}),
  };

  if (error.statusCode >= 500) {
    c.var.logger.error("Unexpected error", logContext);
  } else {
    c.var.logger.warn("Operational error", logContext);
  }

  // Return appropriate response based on request type
  const requestType = getRequestType(c);

  switch (requestType) {
    case "htmx":
      // HTMX partial - return error fragment for swap
      c.header("hx-reswap", "outerHTML");
      return c.html(
        <ErrorPartial message={error.message} />,
        // In order for swap to happen we override the status code to 200
        200,
      );

    case "json":
      // JSON API - return structured error
      return c.json(
        formatErrorResponse(error),
        error.statusCode as ContentfulStatusCode,
      );

    case "html":
      return renderWithLayout({
        c,
        content: (
          <ErrorPage statusCode={error.statusCode} message={error.message} />
        ),
        statusCode: error.statusCode as ContentfulStatusCode,
      });
  }
};
