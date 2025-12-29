# Contextual Logger Design

## Overview
Add support for creating child loggers with shared context (like `reqId`) that automatically flow through the request lifecycle.

## Design Decisions

### 1. Logger Interface
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
Use `crypto.randomUUID()` for request IDs:
- Universally unique across distributed systems
- Built-in Web API (no dependencies)
- Standard format (8-4-4-4-12 hex)

### 4. Middleware Integration
Create `loggerMiddleware()` that:
1. Generates `reqId` using `crypto.randomUUID()`
2. Creates child logger: `logger.child({ reqId })`
3. Stores in context: `c.set("logger", requestLogger)`
4. **No automatic request logging** - let handlers decide what to log

### 5. Context Access Pattern
Add helper function for type-safe logger access:

```typescript
// In lib/logger.ts
export function getLogger(c: Context<AppContext>): Logger {
  return c.get("logger") ?? logger;
}

// Usage in handlers
const log = getLogger(c);
log.info("Article created", { articleId: "123" });
```

**Fallback behavior**: Returns root logger if called outside request context

### 6. Type Safety
Extend `AppVariables` to include logger:

```typescript
// types/context.ts
import type { Logger } from "../lib/logger";

export interface AppVariables {
  userId: string;
  logger: Logger; // New
}
```

## Implementation Plan

### Phase 1: Refactor Logger
- [ ] Create `Logger` interface
- [ ] Implement `createLogger()` factory
- [ ] Add `child()` method with context merging
- [ ] Update internal `log()` to merge base context + call metadata
- [ ] Export `logger` as root instance (backward compatible)
- [ ] Add `getLogger(c)` helper
- [ ] Update tests for child logger functionality

### Phase 2: Middleware
- [ ] Create `src/middleware/logger.ts`
- [ ] Implement `loggerMiddleware()` with reqId generation
- [ ] Export middleware function

### Phase 3: Type Definitions
- [ ] Add `Logger` type to `AppVariables`
- [ ] Update imports in `context.ts`

### Phase 4: Integration
- [ ] Import `loggerMiddleware` in `main.ts`
- [ ] Apply middleware globally: `app.use("*", loggerMiddleware)`
- [ ] Decide whether to keep or remove Hono's built-in logger

### Phase 5: Documentation
- [ ] Update logger.example.ts with child logger examples
- [ ] Add middleware usage examples
- [ ] Document getLogger() pattern for services

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
