# Error Handler Refactor - Final Proposal

## Executive Summary

The implementation plan proposes refactoring error handling to use custom error classes and centralized middleware. After careful analysis, **this proposal is sound but incomplete** - it needs significant enhancements to work properly with HTMX and the application's architecture.

## Current State Analysis

### Problems with Current Implementation

1. **String-based error parsing** - Routes parse error messages:
   ```typescript
   if (errorMessage === "Article not found") {
     return c.json({ error: "Article not found" }, 404);
   }
   ```

2. **Duplicated error handling** - Same try-catch pattern repeated across routes:
   - src/routes/api.tsx (multiple endpoints)
   - src/routes/articles.tsx (list and detail views)

3. **Inconsistent error responses**:
   - Some routes return JSON
   - Some return HTML fragments
   - Some return full pages
   - No pattern for HTMX vs non-HTMX requests

4. **Mixed concerns** - Routes handle:
   - Business logic
   - HTTP concerns
   - Error formatting
   - HTMX swap logic

## Original Proposal Strengths

✅ **Custom error classes** - Type-safe, clear intent, eliminates string parsing
✅ **Centralized handling** - DRY principle, single source of truth
✅ **Service layer updates** - Better separation of concerns
✅ **Route simplification** - Less boilerplate

## Original Proposal Gaps

❌ **No HTMX awareness** - Doesn't address partial vs full page responses
❌ **No OOB swap handling** - Current app uses OOB swaps for empty states
❌ **No error context** - Errors need userId, articleId for logging
❌ **No retry guidance** - Client doesn't know if error is retryable
❌ **Unclear component usage** - When to use ErrorPage vs ErrorPartial?

---

## Enhanced Proposal

### 1. Custom Error Classes (Enhanced)

```typescript
// src/lib/errors.ts

/**
 * Base application error with HTTP status code and context
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly isOperational: boolean;  // Expected vs bug
  readonly retryable: boolean = false;       // Can client retry?
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
 */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly isOperational = true;
  readonly retryable = false;

  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      { resource, id }
    );
  }
}

/**
 * Unauthorized access (401)
 */
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly isOperational = true;
  readonly retryable = false;

  constructor(message = "Authentication required") {
    super(message);
  }
}

/**
 * Forbidden access (403)
 */
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly isOperational = true;
  readonly retryable = false;

  constructor(message = "Access denied") {
    super(message);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly isOperational = true;
  readonly retryable = false;

  constructor(message: string, fields?: Record<string, string>) {
    super(message, { fields });
  }
}

/**
 * External service error (502/503)
 */
export class ExternalServiceError extends AppError {
  readonly statusCode = 503;
  readonly isOperational = true;
  readonly retryable = true;  // Client CAN retry

  constructor(service: string, originalError?: Error) {
    super(`External service error: ${service}`, {
      service,
      originalMessage: originalError?.message,
    });
  }
}

/**
 * Internal server error (500)
 */
export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly isOperational = false;  // This is a bug
  readonly retryable = false;

  constructor(message = "Internal server error", context?: Record<string, unknown>) {
    super(message, context);
  }
}
```

### 2. Error Display Components

```typescript
// src/components/errors/ErrorPage.tsx
import { Layout } from "../Layout";

interface ErrorPageProps {
  statusCode: number;
  message: string;
  retryUrl?: string;
}

/**
 * Full-page error display (for non-HTMX requests)
 */
export function ErrorPage({ statusCode, message, retryUrl }: ErrorPageProps) {
  return (
    <Layout title={`Error ${statusCode}`} isAuthenticated={false}>
      <div class="error-page">
        <h1>{statusCode}</h1>
        <p>{message}</p>
        {retryUrl && (
          <a href={retryUrl} class="button">
            Try Again
          </a>
        )}
        <a href="/" class="button secondary">
          Go Home
        </a>
      </div>
    </Layout>
  );
}

// src/components/errors/ErrorPartial.tsx
interface ErrorPartialProps {
  message: string;
  retryable?: boolean;
  retryUrl?: string;
}

/**
 * Partial error display (for HTMX swaps)
 */
export function ErrorPartial({ message, retryable, retryUrl }: ErrorPartialProps) {
  return (
    <div class="error-partial" role="alert">
      <p class="error-message">{message}</p>
      {retryable && retryUrl && (
        <button
          type="button"
          hx-get={retryUrl}
          hx-swap="outerHTML"
          class="button small"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// src/components/errors/ErrorMessage.tsx
/**
 * JSON error response (for API routes)
 */
export function formatErrorResponse(error: AppError) {
  return {
    error: error.message,
    statusCode: error.statusCode,
    retryable: error.retryable,
    ...(error.context && { context: error.context }),
  };
}
```

### 3. Error Handling Middleware (HTMX-aware)

```typescript
// src/middleware/errorHandler.ts
import type { Context, Next } from "hono";
import { AppError, InternalError } from "../lib/errors";
import { ErrorPage } from "../components/errors/ErrorPage";
import { ErrorPartial } from "../components/errors/ErrorPartial";
import { formatErrorResponse } from "../components/errors/ErrorMessage";
import type { AppContext } from "../types/context";

/**
 * Detect request type for appropriate error response
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
 * IMPORTANT: Register this LAST in middleware chain so it catches all errors
 */
export function errorHandler() {
  return async (c: Context<AppContext>, next: Next) => {
    try {
      await next();
    } catch (err) {
      // Convert unknown errors to AppError
      const error = err instanceof AppError
        ? err
        : new InternalError("An unexpected error occurred", {
            originalError: err instanceof Error ? err.message : String(err),
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
      const requestType = getRequestType(c);

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
    }
  };
}
```

### 4. Service Layer Updates

```typescript
// Before:
export async function getArticleById(id: string, userId: string): Promise<Article> {
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, id), eq(articles.userId, userId)))
    .limit(1);

  if (!article) {
    throw new Error("Article not found");  // ❌ String parsing needed
  }

  return article;
}

// After:
import { NotFoundError, ForbiddenError } from "../lib/errors";

export async function getArticleById(id: string, userId: string): Promise<Article> {
  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);

  if (!article) {
    throw new NotFoundError("Article", id);  // ✅ Type-safe
  }

  // Check ownership
  if (article.userId !== userId) {
    throw new ForbiddenError("You don't have access to this article");
  }

  return article;
}
```

### 5. Route Simplification

```typescript
// Before (api.tsx):
api.post("/api/articles/:id/read", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId");
  const articleId = c.req.param("id");

  try {
    await markArticleAsRead(articleId, userId);
    return c.body(null, 204);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage === "Article not found") {
      return c.json({ error: "Article not found" }, 404);
    }

    console.error("Error marking article as read:", error);
    return c.json({ error: "Failed to mark article as read" }, 500);
  }
});

// After:
api.post("/api/articles/:id/read", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId");
  const articleId = c.req.param("id");

  // Service throws typed errors, middleware handles them
  await markArticleAsRead(articleId, userId);
  return c.body(null, 204);
});
```

### 6. Main Entry Registration

```typescript
// src/main.ts

import { errorHandler } from "./middleware/errorHandler";

// ... other setup

// Register routes
app.route("/", homeRouter);
app.route("/", authRouter);
app.route("/", articlesRouter);
app.route("/", apiRouter);

// IMPORTANT: Register error handler LAST
app.onError(errorHandler());

// Start server
```

---

## Implementation Strategy

### Phase 1: Foundation (No Breaking Changes)

1. Create error classes in `src/lib/errors.ts`
2. Create error components in `src/components/errors/`
3. Create error middleware in `src/middleware/errorHandler.ts`
4. Add tests for error classes and middleware

### Phase 2: Service Layer Migration

Migrate services one by one:
1. `articles.service.ts` - highest usage
2. `content.service.ts`
3. `tags.service.ts`
4. `summaries.service.ts`
5. `preferences.service.ts`

### Phase 3: Route Layer Cleanup

Remove try-catch blocks:
1. `/api/*` routes (simplest)
2. `/articles/*` routes
3. `/auth/*` routes

### Phase 4: Testing & Refinement

1. Update all tests to expect typed errors
2. Test HTMX error responses
3. Test error logging
4. Verify OOB swaps still work

---

## Special Considerations

### HTMX OOB Swaps

Current pattern in api.tsx:
```typescript
return c.html(
  <>
    {remainingCount === 0 && (
      <div id="article-container" hx-swap-oob="true">
        <EmptyState archived={!newStatus} />
      </div>
    )}
  </>,
);
```

**Solution**: Error middleware should NOT interfere with successful OOB swaps. Only errors throw and get caught.

### Auth Middleware Integration

Current `requireAuth()` middleware already handles unauthenticated users. Error handler should NOT catch these - let auth middleware handle redirects/401s.

**Pattern**:
- Auth middleware returns early (no error thrown)
- Error middleware only catches thrown errors
- Separation of concerns maintained

### Worker Error Handling

Workers should also use typed errors:
```typescript
// src/workers/process-metadata.ts
import { ExternalServiceError } from "../lib/errors";

try {
  const content = await extractCleanContent(url);
} catch (error) {
  // Wrap external errors
  throw new ExternalServiceError("Readability", error);
}
```

Workers post errors to parent, which logs them appropriately.

---

## Migration Checklist

### Before Starting
- [ ] Review all current error handling patterns
- [ ] Document all error types in current use
- [ ] Plan rollback strategy

### Implementation
- [ ] Create error classes (`src/lib/errors.ts`)
- [ ] Create error components (`src/components/errors/`)
- [ ] Create error middleware (`src/middleware/errorHandler.ts`)
- [ ] Write tests for new error infrastructure
- [ ] Update one service as proof of concept
- [ ] Update corresponding route
- [ ] Test HTMX behavior, JSON responses, full pages
- [ ] If successful, migrate remaining services/routes

### Testing
- [ ] Unit tests: Error classes instantiate correctly
- [ ] Unit tests: Middleware detects request type correctly
- [ ] Integration: HTMX requests get ErrorPartial responses
- [ ] Integration: JSON requests get structured JSON errors
- [ ] Integration: Browser requests get ErrorPage with Layout
- [ ] Integration: OOB swaps still work
- [ ] Integration: Auth middleware still works
- [ ] E2E: Error flows work end-to-end

### Cleanup
- [ ] Remove all string-based error parsing
- [ ] Remove duplicated try-catch blocks
- [ ] Update CLAUDE.md with error handling patterns
- [ ] Remove old error handling comments/TODOs

---

## Benefits After Migration

✅ **Type Safety**: TypeScript catches error handling mistakes
✅ **DRY**: No duplicated error handling logic
✅ **Consistent**: Same error format across all routes
✅ **Maintainable**: Change error handling in one place
✅ **Testable**: Easy to mock and test error scenarios
✅ **Observable**: Structured error logging with context
✅ **HTMX-friendly**: Proper partial vs full page responses
✅ **Client-friendly**: Retryable flag guides UX

---

## Risks & Mitigation

### Risk: Breaking existing error handling
**Mitigation**: Incremental migration, keep old patterns working alongside new

### Risk: HTMX swaps behave unexpectedly
**Mitigation**: Extensive testing of HTMX error responses, verify swap targets

### Risk: Performance overhead from middleware
**Mitigation**: Middleware only runs on errors (exceptional path), minimal impact

### Risk: Over-engineering for small codebase
**Mitigation**: This is a valid concern - consider deferring until pain point is felt

---

## Recommendation

### 👍 **PROCEED** with error handler refactor, BUT:

1. **Use incremental migration** - Don't rewrite everything at once
2. **Start with highest-pain areas** - API routes have most duplication
3. **Test thoroughly** - HTMX behavior is critical to preserve
4. **Document patterns** - Update CLAUDE.md with examples
5. **Consider deferring** - This is a v2+ improvement, not critical for v1

### Alternative: Lightweight Refactor

If full refactor feels too heavy, consider **minimal changes**:

1. Create 3-4 error classes (NotFoundError, ValidationError, InternalError)
2. Update services to throw typed errors
3. Keep try-catch in routes, but use `instanceof` checks instead of string parsing
4. Add helper function for consistent error responses
5. No middleware (simpler, less magic)

This gives 80% of the benefits with 20% of the complexity.

---

## Final Verdict

**The original proposal is SOUND but INCOMPLETE.**

The enhanced proposal above addresses all gaps and provides a production-ready error handling system that:
- Works correctly with HTMX
- Maintains existing patterns (OOB swaps, auth middleware)
- Provides excellent DX and observability
- Can be implemented incrementally

**Recommended timing**: After Phase 7 (Testing) or when error handling becomes a pain point during development.
