# Contextual Logger Design

## Overview
Add support for creating child loggers with shared context (like `requestId`) that automatically flow through the request lifecycle, using Hono's built-in `contextStorage` and `requestId` middleware.

## Design Decisions

### 1. Use Hono's Built-in Middleware
Instead of creating custom middleware, leverage Hono's official middleware:
- **`contextStorage()`** - Enables `getContext()` anywhere in the request lifecycle
- **`requestId()`** - Generates UUID per request and sets `requestId` in context

This approach:
- Follows Hono conventions and best practices
- Reduces custom code and maintenance burden
- Provides standardized request ID generation
- Enables accessing context anywhere via `getContext()`

### 2. Logger Interface
Refactor from object literal to factory function that supports child loggers:

```typescript
interface Logger {
  context: Record<string, unknown>;
  child(context: Record<string, unknown>): Logger;
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}

// Factory function
function createLogger(baseContext?: Record<string, unknown>): Logger

// Root logger (no context)
export const logger = createLogger();
```

### 2. Context Merging
Child logger context is merged with per-call metadata:

```typescript
const rootLogger = createLogger();
const reqLogger = rootLogger.child({ reqId: "abc-123" });
reqLogger.info("User action", { userId: "456" });
// Output: { level: "info", message: "User action", reqId: "abc-123", userId: "456", ... }
```

**Priority**: `call metadata` > `child context` > `parent context`
- Allows overriding context values per call if needed

### 3. Request ID Generation
Use Hono's `requestId()` middleware:
- Generates UUID via `crypto.randomUUID()` by default
- Sets `requestId` in context automatically
- Adds `X-Request-Id` response header for tracing
- Configurable via options (custom generator, header name, etc.)

### 4. Middleware Integration
Apply middleware in correct order:
1. **`contextStorage()`** - Must be first, enables global context access
2. **`requestId()`** - Generates requestId and stores in context
3. **`loggerMiddleware()`** - Custom middleware that:
   - Gets `requestId` from context: `c.get("requestId")`
   - Creates child logger: `logger.child({ reqId: requestId })`
   - Stores in context: `c.set("logger", requestLogger)`
   - **No automatic request logging** - let handlers decide what to log

### 5. Context Access Pattern
Two ways to access the logger:

```typescript
// Pattern 1: Explicit context (in route handlers)
export function getLogger(c: Context<AppContext>): Logger {
  return c.get("logger") ?? logger;
}

// Pattern 2: Context storage (anywhere in request lifecycle)
export function getLogger(): Logger {
  try {
    const ctx = getContext();
    return ctx.get("logger") ?? logger;
  } catch {
    return logger; // Fallback if outside request context
  }
}

// Combined: Support both patterns
export function getLogger(c?: Context<AppContext>): Logger;
```

**Usage examples:**
```typescript
// In route handlers (explicit context)
app.get("/articles", async (c) => {
  const log = getLogger(c);
  log.info("Fetching articles");
});

// In services (using context storage)
async function processArticle(articleId: string) {
  const log = getLogger(); // No context needed!
  log.info("Processing article", { articleId });
}
```

**Fallback behavior**: Returns root logger if called outside request context or if context storage not available

### 6. Type Safety
Extend `AppVariables` to include logger and requestId:

```typescript
// types/context.ts
import type { RequestIdVariables } from "hono/request-id";
import type { Logger } from "../lib/logger";

export interface AppVariables extends RequestIdVariables {
  userId: string;
  logger: Logger;
}
```

This provides full type safety:
- `c.get("requestId")` returns `string`
- `c.get("logger")` returns `Logger`
- `c.get("userId")` returns `string`

## Implementation Plan

### Phase 1: Refactor Logger ✅
- [x] Create `Logger` interface
- [x] Implement `createLogger()` factory
- [x] Add `child()` method with context merging
- [x] Update internal `log()` to merge base context + call metadata
- [x] Export `logger` as root instance (backward compatible)
- [x] Add `getLogger(c?)` helper with optional context
- [x] Update tests for child logger functionality

### Phase 2: Middleware ✅
- [x] Use Hono's `contextStorage()` and `requestId()` middleware
- [x] Create `src/middleware/logger.ts`
- [x] Implement `loggerMiddleware()` that uses `requestId` from context
- [x] Remove custom UUID generation (use Hono's instead)

### Phase 3: Type Definitions ✅
- [x] Import `RequestIdVariables` from "hono/request-id"
- [x] Extend `AppVariables` with `RequestIdVariables`
- [x] Add `Logger` type to `AppVariables`

### Phase 4: Integration ✅
- [x] Import built-in middleware in `main.ts`
- [x] Apply middleware in order: `contextStorage()` → `requestId()` → `loggerMiddleware`
- [x] Remove Hono's built-in logger (replaced with our structured logger)

### Phase 5: Documentation ✅
- [x] Update logger.example.ts with child logger examples
- [x] Add middleware usage examples
- [x] Document getLogger() pattern for services (both explicit and context storage)
- [x] Update design doc to reflect Hono middleware usage

## Implementation Summary

Successfully implemented contextual logging using Hono's built-in middleware:

**Key Components:**
1. **Logger factory** - `createLogger()` with child logger support
2. **Hono middleware stack** - `contextStorage()` → `requestId()` → `loggerMiddleware`
3. **Flexible access** - `getLogger(c)` or `getLogger()` via context storage
4. **Type-safe context** - Extends `RequestIdVariables` for full type safety

**Benefits:**
- **Less custom code** - Leverages Hono's battle-tested middleware
- **Standard patterns** - Follows Hono conventions and best practices
- **Zero boilerplate** - Services don't need context passed around
- **Request tracing** - Automatic `requestId` in logs and response headers
- **Backward compatible** - Root logger still works everywhere

**Usage:**
```typescript
// Route handlers
app.get("/articles", async (c) => {
  const log = getLogger(c);  // Explicit context
  log.info("Fetching articles");
});

// Services (with context storage)
async function processArticle(articleId: string) {
  const log = getLogger();  // Gets from context storage
  log.info("Processing", { articleId });  // Includes requestId automatically
}
```

## Usage Examples

### In Route Handlers
```typescript
import { requireAuth } from "../middleware/auth";
import { getLogger } from "../lib/logger";

articlesRouter.get("/articles", requireAuth("redirect"), async (c) => {
  const log = getLogger(c);
  const userId = c.get("userId") as string;

  log.info("Fetching articles", { userId, filter: "unread" });
  // Output includes reqId automatically

  const articles = await getArticles(userId);
  log.info("Articles fetched", { count: articles.length });

  return c.html(ArticlesPage({ articles }));
});
```

### In Services (Passing Logger)
```typescript
// Option 1: Pass logger as parameter
export async function processArticle(
  articleId: string,
  log: Logger
): Promise<void> {
  log.info("Processing article started", { articleId });

  try {
    // ... processing logic
    log.info("Processing completed", { articleId, duration: 1200 });
  } catch (error) {
    log.error("Processing failed", { articleId, error });
    throw error;
  }
}

// Usage in handler
const log = getLogger(c);
await processArticle(articleId, log);
```

### Creating Custom Child Loggers
```typescript
// Add operation-specific context
const log = getLogger(c);
const workerLog = log.child({ workerId: "worker-1", operation: "tag-extraction" });

workerLog.debug("Starting tag extraction", { articleId: "123" });
// Output: { reqId: "...", workerId: "worker-1", operation: "tag-extraction", ... }
```

## Backward Compatibility

✅ Existing code using root logger continues to work:
```typescript
import { logger } from "./lib/logger";
logger.info("App started"); // Still works
```

✅ Tests using root logger are unaffected

## Migration Strategy

1. **Deploy changes** - middleware is opt-in via getLogger()
2. **Gradual adoption** - convert routes one by one
3. **Services layer** - add logger parameter to service functions
4. **Workers** - consider adding structured logging with correlation IDs

## Open Questions

1. **Should middleware log requests automatically?**
   - Pro: Consistent request/response logging
   - Con: Noise in logs, users may want custom format
   - **Recommendation**: No auto-logging, let handlers control it

2. **Keep Hono's built-in logger?**
   - Current: `app.use("*", logger())` from "hono/logger"
   - **Recommendation**: Remove it, use our structured logger instead

3. **Should we add more request context automatically?**
   - method, path, userAgent, ip?
   - **Recommendation**: Start with just reqId, add others if needed

4. **Context for bot handlers?**
   - Bot handlers don't have Hono context
   - Could add chatId/userId to logger in bot
   - **Recommendation**: Handle separately, not in this PR

## Testing Strategy

- [ ] Unit tests: child logger context merging
- [ ] Unit tests: context priority (call > child > parent)
- [ ] Unit tests: getLogger fallback behavior
- [ ] Integration test: middleware sets logger in context
- [ ] Integration test: reqId flows through handler chain
- [ ] E2E test: verify logs include reqId in production format

## Performance Considerations

- `crypto.randomUUID()` is fast (< 1μs per call)
- Object spreading for context merge is negligible for small objects
- No performance regression expected

## Future Enhancements

- Add correlation ID for bot → web flow
- Add user context when available: `log.child({ userId })`
- Structured log levels from config (e.g., LOG_LEVEL=debug)
- Log sampling for high-traffic routes
- Integration with external logging services (Datadog, Sentry)
