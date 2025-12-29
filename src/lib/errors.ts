/**
 * Custom error classes for type-safe error handling
 *
 * These errors provide:
 * - HTTP status codes
 * - Operational vs bug classification
 * - Retry guidance for clients
 * - Structured context for logging
 */

/**
 * Base application error with HTTP status code and context
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly isOperational: boolean; // Expected vs bug
  readonly retryable: boolean = false; // Can client retry?
  readonly context?: Record<string, unknown>; // Additional data

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Resource not found (404)
 *
 * Usage: throw new NotFoundError("Article", articleId)
 */
export class NotFoundError extends AppError {
  override readonly statusCode = 404;
  override readonly isOperational = true;
  override readonly retryable = false;

  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`, {
      resource,
      id,
    });
  }
}

/**
 * Unauthorized access (401)
 *
 * Usage: throw new UnauthorizedError()
 */
export class UnauthorizedError extends AppError {
  override readonly statusCode = 401;
  override readonly isOperational = true;
  override readonly retryable = false;

  constructor(message = "Authentication required") {
    super(message);
  }
}

/**
 * Forbidden access (403)
 *
 * Usage: throw new ForbiddenError("You don't have access to this article")
 */
export class ForbiddenError extends AppError {
  override readonly statusCode = 403;
  override readonly isOperational = true;
  override readonly retryable = false;

  constructor(message = "Access denied") {
    super(message);
  }
}

/**
 * Validation error (400)
 *
 * Usage: throw new ValidationError("Invalid input", { field: "url", reason: "not a valid URL" })
 */
export class ValidationError extends AppError {
  override readonly statusCode = 400;
  override readonly isOperational = true;
  override readonly retryable = false;

  constructor(message: string, fields?: Record<string, string>) {
    super(message, { fields });
  }
}

/**
 * External service error (502/503)
 *
 * Usage: throw new ExternalServiceError("Readability", originalError)
 */
export class ExternalServiceError extends AppError {
  override readonly statusCode = 503;
  override readonly isOperational = true;
  override readonly retryable = true; // Client CAN retry

  constructor(service: string, originalError?: Error) {
    super(`External service error: ${service}`, {
      service,
      originalMessage: originalError?.message,
    });
  }
}

/**
 * Internal server error (500)
 *
 * Usage: throw new InternalError("Unexpected state", { articleId, state })
 */
export class InternalError extends AppError {
  override readonly statusCode = 500;
  override readonly isOperational = false; // This is a bug
  override readonly retryable = false;

  constructor(
    message = "Internal server error",
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}
