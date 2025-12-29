export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
  }
}

/**
 * Resource not found (404)
 *
 * Usage: throw new NotFoundError("Article", articleId)
 */
export class NotFoundError extends AppError {
  override readonly statusCode = 404;

  constructor(resource: string, id?: string) {
    super(`${resource} not found`, {
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

  constructor(
    message = "Internal server error",
    context?: Record<string, unknown>,
  ) {
    super(message, context);
  }
}
