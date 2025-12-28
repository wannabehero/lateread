import type { AppError } from "../../lib/errors";

/**
 * JSON error response formatter (for API routes)
 *
 * Converts AppError to structured JSON response
 * Includes status code, retry guidance, and optional context
 */
export function formatErrorResponse(error: AppError) {
	return {
		error: error.message,
		statusCode: error.statusCode,
		retryable: error.retryable,
		...(error.context && { context: error.context }),
	};
}
