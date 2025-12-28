import type { Context, ErrorHandler } from "hono";
import { AppError, InternalError } from "../lib/errors";
import { ErrorPage } from "../components/errors/ErrorPage";
import { ErrorPartial } from "../components/errors/ErrorPartial";
import { formatErrorResponse } from "../components/errors/ErrorMessage";
import type { AppContext } from "../types/context";

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
 *
 * IMPORTANT: Register this using app.onError() in main.ts
 */
export const errorHandler: ErrorHandler = (err: Error, c: Context) => {
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
		error: error.name,
		message: error.message,
		statusCode: error.statusCode,
		path: c.req.path,
		method: c.req.method,
		userId,
		...(error.context || {}),
	};

	if (error.isOperational) {
		console.warn("Operational error:", logContext);
	} else {
		console.error("Unexpected error:", logContext, err);
	}

	// Return appropriate response based on request type
	const requestType = getRequestType(c as Context<AppContext>);

	switch (requestType) {
		case "htmx":
			// HTMX partial - return error fragment for swap
			return c.html(
				<ErrorPartial
					message={error.message}
					retryable={error.retryable}
					retryUrl={error.retryable ? c.req.path : undefined}
				/>,
				error.statusCode,
			);

		case "json":
			// JSON API - return structured error
			return c.json(formatErrorResponse(error), error.statusCode);

		case "html":
		default:
			// Full HTML page
			return c.html(
				<ErrorPage
					statusCode={error.statusCode}
					message={error.message}
					retryUrl={error.retryable ? c.req.path : undefined}
				/>,
				error.statusCode,
			);
	}
};
