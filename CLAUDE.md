# CLAUDE.md

## Overview

**lateread** is a self-hosted, privacy-focused read-later application. Users save articles via Telegram bot, articles are processed with AI for tagging/summarization, and consumed through a web interface with TTS support.

## AI Assistant Guidelines

**IMPORTANT: Always verify against official documentation before making architectural decisions.**

When working with this codebase, consult the latest official documentation:
- **Bun**: https://bun.com/docs - Runtime behavior, environment variables, testing
- **Drizzle ORM**: https://orm.drizzle.team/docs - Query API, migrations, relations
- **Hono**: https://hono.dev/docs - Routing, middleware, context, JSX
- **Grammy**: https://grammy.dev/guide - Telegram bot API, handlers, context
- **Zod**: https://zod.dev - Schema validation, type inference

**Before implementing:**
1. Check official docs for current best practices
2. Verify feature availability and syntax
3. Review framework-specific patterns and conventions
4. Don't rely solely on general knowledge - frameworks evolve

**Example:** Environment variable handling in Bun test mode - always check the docs for how `NODE_ENV` and `.env.*` files work together rather than assuming behavior.

## Quick Reference

```bash
# Development
bun run dev              # Start server + web build watcher (concurrently)
bun run dev:server       # Start server only with hot reload
bun run dev:web          # Build web assets with watcher

# Testing
bun test                 # Run all tests
bun test --watch         # Watch mode
bun test --coverage      # Generate coverage

# Database
bun run db:generate      # Generate migrations from schema changes
bun run db:migrate       # Run migrations
bun run db:studio        # Open Drizzle Studio

# Code Quality
bun run check            # Run Biome linter + formatter
bun run format           # Format only
bun run lint             # Lint only

# Production
bun run build:web        # Minified production build with hashes
bun run start            # Start production server
```

## Project Structure

```
src/
├── main.ts              # App entry point (config -> migrations -> middleware -> routes -> bot -> cron)
├── cron.ts              # Central registry for ALL scheduled tasks
├── bot/                 # Telegram bot (Grammy)
│   ├── index.ts         # Bot instance, start/stop functions
│   ├── handlers.ts      # Command and message handlers
│   └── helpers.ts       # Bot utility functions
├── components/          # Hono JSX components
│   ├── auth/            # Login, AuthPolling, AuthError
│   └── errors/          # ErrorPage, ErrorPartial
├── db/
│   ├── schema.ts        # Drizzle schema definitions
│   └── types.ts         # Inferred types from schema
├── lib/                 # Core utilities
│   ├── config.ts        # Zod-validated environment config (MUST import first)
│   ├── db.ts            # Database connection and migrations
│   ├── errors.ts        # Custom error classes (NotFoundError, etc.)
│   ├── logger/          # Contextual logging system
│   ├── auth.ts          # Token-based auth (create, claim, check)
│   ├── session.ts       # HMAC-signed session cookies
│   ├── content-cache.ts # User-scoped article content cache
│   ├── llm.ts           # LLM provider abstraction (Claude)
│   ├── tts.ts           # TTS provider abstraction (ElevenLabs)
│   ├── readability.ts   # Article content extraction
│   ├── safe-fetch.ts    # SSRF-validated HTTP requests
│   └── worker.ts        # Worker spawning utility
├── middleware/
│   ├── auth.ts          # requireAuth("redirect"|"json-401")
│   ├── session.ts       # Session cookie handling
│   ├── security.ts      # CORS, CSP, security headers
│   ├── logger.ts        # Request-scoped logger
│   └── errorHandler.tsx # Global error handler
├── routes/              # Hono route handlers
│   ├── home.tsx         # Landing page
│   ├── auth.tsx         # /auth/* endpoints
│   ├── articles.tsx     # /articles/* pages
│   ├── search.tsx       # Search page
│   ├── api.tsx          # API endpoints
│   └── health.tsx       # Health check
├── schemas/             # Shared Zod validation schemas
│   └── common.ts        # Common schemas (articleIdParam, etc.)
├── services/            # Database operations & business logic
│   ├── articles.service.ts
│   ├── tags.service.ts
│   ├── content.service.ts
│   ├── summaries.service.ts
│   ├── preferences.service.ts
│   ├── subscription.service.ts
│   ├── retry.service.ts
│   └── telegram-users.service.ts
├── types/
│   └── context.ts       # AppContext, AppVariables types
└── workers/
    └── process-metadata.ts  # Background article processing

web/                     # Frontend assets (bundled to public/)
├── scripts/             # JS modules
└── styles/              # CSS files

drizzle/                 # Generated migrations
test/
├── bootstrap.ts         # In-memory SQLite setup
└── fixtures.ts          # Test data factories
```

## Core Patterns

### Configuration

All environment variables go through `src/lib/config.ts` with Zod validation:

```typescript
// CORRECT - config is imported first in main.ts
import { config } from "./lib/config";  // MUST be first import in main.ts

// WRONG - never access process.env directly
const port = process.env.PORT;  // Never do this
```

### Services Layer

All database operations go through services. Routes and workers are thin controllers:

```typescript
// src/services/articles.service.ts
export async function getArticlesWithTags(
  userId: string,
  filters: { archived?: boolean; tag?: string }
): Promise<ArticleWithTags[]> {
  // All DB logic here using Drizzle
}

// src/routes/articles.tsx
articlesRouter.get("/articles", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId") as string;
  const articles = await getArticlesWithTags(userId, { archived: false });
  // Render response
});
```

Services are:
- Stateless async functions (not classes)
- Throw custom errors (`NotFoundError`, `ValidationError`, etc.)
- Use Drizzle query builder for type-safe queries
- Use transactions for multi-table operations

### Authentication Middleware

```typescript
// Page routes - redirects to / if not authenticated
app.get("/articles", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId") as string;
  // ...
});

// API routes - returns 401 JSON if not authenticated
app.post("/api/articles/:id", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId") as string;
  // ...
});
```

### Route Input Validation

Use the custom `validator` middleware from `src/lib/validator.ts` with Zod schemas for all route inputs. Inline schemas directly in the validator call:

```typescript
import { z } from "zod";
import { validator } from "../lib/validator";

// Inline schema directly in validator call
app.get(
  "/articles",
  requireAuth("redirect"),
  validator(
    "query",
    z.object({
      status: z.enum(["all", "archived"]).optional().default("all"),
      tag: z
        .string()
        .trim()
        .min(1, "Tag cannot be empty")
        .toLowerCase()
        .optional(),
    }),
  ),
  async (c) => {
    const { status, tag } = c.req.valid("query");
    // ...
  },
);
```

**Validation patterns:**

- **Inline schemas**: Always inline schemas directly in the `validator()` call - don't create separate variables
- **Shared schemas**: Only for truly common schemas (like `articleIdParam`), put in `src/schemas/common.ts`
- **Input sanitization**: Use `.trim()` and `.toLowerCase()` transforms where appropriate
- **Prevent injection**: Reject special characters (e.g., `%` in search queries used with SQL LIKE)
- **Error handling**: Invalid input throws `ValidationError`, caught by global error handler

```typescript
// Shared schema for article ID (used in many routes)
// src/schemas/common.ts
import { z } from "zod";

export const articleIdParam = z.object({
  id: z.string().uuid("Invalid article ID format"),
});

// Usage in route
import { articleIdParam } from "../schemas/common";

app.get(
  "/articles/:id",
  requireAuth("redirect"),
  validator("param", articleIdParam),
  async (c) => {
    const { id } = c.req.valid("param");
    // ...
  },
);
```

**Validation targets:**
- `"query"` - URL query parameters (`?key=value`)
- `"param"` - URL path parameters (`/:id`)
- `"form"` - Form data (POST bodies)

### HTMX Responses

Detect HTMX requests and return appropriate response:

```typescript
import { renderWithLayout } from "../lib/render";

articlesRouter.get("/articles", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId") as string;
  const articles = await getArticlesWithTags(userId, {});

  const content = <ArticleList articles={articles} />;

  // Returns full page for direct navigation, partial for HTMX
  return renderWithLayout({ c, content });
});
```

For HTMX redirects, use the header:
```typescript
c.header("hx-redirect", "/articles");
return c.body(null, 204);
```

### Components

Functional components using Hono's JSX:

```tsx
import type { FC } from "hono/jsx";
import type { ArticleWithTags } from "../db/types";

interface ArticleCardProps {
  article: ArticleWithTags;
  isArchived?: boolean;
}

export const ArticleCard: FC<ArticleCardProps> = ({ article, isArchived }) => {
  return (
    <article>
      <h3>{article.title}</h3>
      {/* HTMX attributes for interactivity */}
      <button
        type="button"
        hx-post={`/api/articles/${article.id}/archive`}
        hx-swap="outerHTML"
      >
        {isArchived ? "Unarchive" : "Archive"}
      </button>
    </article>
  );
};
```

### Workers

Background processing with fire-and-forget pattern:

```typescript
// Spawning a worker (from bot handler)
import { spawnArticleWorker } from "../lib/worker";

spawnArticleWorker({
  articleId,
  onSuccess: (id) => logger.info("Processed", { articleId: id }),
  onFailure: (id, error) => logger.error("Failed", { articleId: id, error }),
});

// Worker file (src/workers/process-metadata.ts)
self.onmessage = async (event: MessageEvent<{ articleId: string }>) => {
  const { articleId } = event.data;
  try {
    // Processing pipeline...
    self.postMessage({ success: true, articleId });
  } catch (error) {
    self.postMessage({ success: false, articleId, error: String(error) });
  }
};
```

### Error Handling

Custom error classes in `src/lib/errors.ts`:

```typescript
import { NotFoundError, ValidationError } from "../lib/errors";

// In service
export async function getArticle(id: string, userId: string) {
  const article = await db.query.articles.findFirst({
    where: and(eq(articles.id, id), eq(articles.userId, userId)),
  });
  if (!article) throw new NotFoundError("Article not found");
  return article;
}
```

Available errors: `NotFoundError` (404), `UnauthorizedError` (401), `ForbiddenError` (403), `ValidationError` (400), `ExternalServiceError` (503), `InternalError` (500).

### Logging

Contextual logging with child loggers:

```typescript
import { defaultLogger } from "../lib/logger";

const logger = defaultLogger.child({ module: "articles" });

// In route handler, get request-scoped logger
const logger = getLogger(c);
logger.info("Article fetched", { articleId });
```

### Database Conventions

- **Tags stored lowercase**: Always normalize with `tag.toLowerCase()`
- **Article status**: `pending` -> `processing` -> `completed` (or `failed` -> `error`)
- **Cascade deletes**: Configured for referential integrity
- **Transactions**: Use for multi-table operations
- **Content cache**: User-scoped at `{CACHE_DIR}/{userId}/{articleId}.html`

```typescript
// Transaction example
await db.transaction(async (tx) => {
  await tx.update(articles).set({ status: "completed" }).where(eq(articles.id, id));
  for (const tag of tags) {
    await tx.insert(articleTags).values({ articleId: id, tagId: tag.id });
  }
});
```

## Testing

**IMPORTANT:** Always run `bun install` before running tests. This is a common pitfall - tests will fail with module resolution errors if dependencies are not installed.

Using Bun's test runner with in-memory SQLite:

```typescript
import { beforeEach, describe, expect, it } from "bun:test";
import { db, resetDatabase } from "../../test/bootstrap";
import { createUser, createCompletedArticle } from "../../test/fixtures";

describe("articles.service", () => {
  beforeEach(() => {
    resetDatabase();  // Fresh database for each test
  });

  it("should return articles for user", async () => {
    const user = await createUser(db);
    const article = await createCompletedArticle(db, user.id);

    const result = await getArticlesWithTags(user.id, {});

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(article.id);
  });
});
```

Test files are co-located: `src/lib/auth.test.ts` next to `auth.ts`.

### Test Environment Configuration

Bun automatically loads `.env.test` when running tests (since `bun test` sets `NODE_ENV=test`):

```bash
# .env.test - automatically loaded by Bun during test runs
NODE_ENV=test
DATABASE_URL=:memory:

TELEGRAM_BOT_TOKEN=test_bot_token_12345
BOT_USERNAME=test_bot
SESSION_SECRET=test_session_secret_min_32_chars_long
```

**How it works:**
1. `bun test` automatically sets `NODE_ENV=test`
2. Bun loads `.env.test` based on the NODE_ENV value
3. Config module validates environment variables on import
4. Tests run with test-specific configuration

**Best practices:**
- Use `.env.test` for test-specific environment variables
- Keep `.env.test` checked into git (it contains no secrets)
- Mirror the structure of `.env.example` but with test values
- Use `:memory:` for DATABASE_URL in tests

### Mocking Config Values

Most tests should use the config from `.env.test` without mocking. Only mock config when you need to override specific values for a test.

**When you need to override config values:**
```typescript
import { config } from "../lib/config";

// Mock only the specific config values you need to override
mock.module("../lib/config", () => ({
  config: {
    ...config,  // Spread the real config from .env.test
    CACHE_DIR: TEST_CACHE_DIR,  // Override only what you need
  },
}));
```

**Best practices:**
- **DON'T mock config unnecessarily** - use `.env.test` values by default
- **DO spread the real config** when mocking - `...config`
- **DO override only specific values** you need to change for the test
- **NEVER hardcode all config values** in mocks - it's brittle and causes test failures

### Testing with Spies and Mocks

When testing code that depends on external modules or services, use spies:

```typescript
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { contentCache } from "../lib/content-cache";
import * as readability from "../lib/readability";
import { getArticleContent } from "./content.service";

describe("getArticleContent", () => {
  // Declare spies at describe level
  const spyGet = spyOn(contentCache, "get");
  const spySet = spyOn(contentCache, "set");
  const spyExtractCleanContent = spyOn(readability, "extractCleanContent");

  afterEach(() => {
    // Clear all mocks after each test
    mock.clearAllMocks();
  });

  it("should return cached content when available", async () => {
    spyGet.mockResolvedValue("<p>Cached content</p>");
    spySet.mockResolvedValue();

    const result = await getArticleContent("userId", "articleId", "url");

    expect(result).toBe("<p>Cached content</p>");
    expect(spyGet).toHaveBeenCalledWith("userId", "articleId");
    expect(spyExtractCleanContent).not.toHaveBeenCalled();
    expect(spySet).not.toHaveBeenCalled();
  });
});
```

**Spy patterns:**
- **Naming**: Use `spyFunctionName` (e.g., `spyGet`, not `getSpy`)
- **Declaration & Cleanup**: Choose one of two approaches:

  **Approach 1: Spy per test (recommended for most cases)**
  - Declare spy inside each test with `const spy = spyOn(...)`
  - Use `mock.clearAllMocks()` in `afterEach` for global cleanup
  - Simplest and safest - spy is recreated fresh for each test

  **Approach 2: Spy at describe level (for shared setup)**
  - Declare spy once at describe level with `const spy = spyOn(...)`
  - Use `spy.mockRestore()` in `afterEach` or individual `spy.mockReset()` calls
  - NEVER use `clearAllMocks()` with describe-level spies - it won't properly restore
  - Use only when spy setup is complex and truly shared across all tests

- **Mocking**: Use `mockResolvedValue()`, `mockRejectedValue()`, `mockImplementation()` as needed
- **Assertions**: Verify calls with `toHaveBeenCalledWith()`, `toHaveBeenCalledTimes()`, `not.toHaveBeenCalled()`

### Mocking Pitfalls (IMPORTANT)

Bun's mocking has several gotchas that can cause hard-to-debug test failures:

**1. NEVER use `mock.module()` for shared modules**
```typescript
// ❌ BAD - This mock is HOISTED and affects ALL test files globally!
mock.module("../routes/utils/render", () => ({
  renderWithLayout: () => "mocked",
}));

// The above mock will pollute other test files that import render.tsx
// even if they run in parallel. Bun hoists mock.module calls.
```

**Why it's dangerous:** `mock.module()` is hoisted by Bun to the top of the file and applied before any imports. When tests run in parallel, this mock persists and affects other test files importing the same module.

**2. Use spies with proper cleanup instead**
```typescript
// ✅ GOOD - Spy on specific functions with proper restoration
import { afterEach, beforeEach, spyOn } from "bun:test";

describe("myTest", () => {
  let spyFunction: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spyFunction = spyOn(myModule, "myFunction").mockReturnValue("mocked");
  });

  afterEach(() => {
    spyFunction.mockRestore();  // Restore original implementation
  });
});
```

**3. Don't use `mock.clearAllMocks()` with describe-level spies**
```typescript
// ❌ BAD - clearAllMocks() clears the mock implementation, breaking subsequent tests
const spyLog = spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  mock.clearAllMocks();  // This breaks the spy!
});

// ✅ GOOD - Use mockClear() or mockRestore() for describe-level spies
afterEach(() => {
  spyLog.mockClear();   // Clears call history, keeps implementation
  // OR
  spyLog.mockRestore(); // Fully restores original (need to re-spy in beforeEach)
});
```

**4. For tests that need isolation, create spies in beforeEach**
```typescript
// ✅ GOOD - Fresh spy for each test, immune to parallel test pollution
describe("myTest", () => {
  let spyLog: ReturnType<typeof spyOn<typeof console, "log">>;

  beforeEach(() => {
    spyLog = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    spyLog.mockRestore();
  });

  it("works in isolation", () => {
    // spyLog is fresh for this test
  });
});
```

### Testing JSX/Hono Routes

For testing routes that render JSX, use Hono's built-in request testing with happy-dom for DOM assertions:

```typescript
import { beforeEach, describe, expect, it } from "bun:test";
import type { Hono } from "hono";
import { db, resetDatabase } from "../../test/bootstrap";
import {
  createAuthHeaders,
  createCompletedArticle,
  createUser,
  parseHtml,
} from "../../test/fixtures";
import { createApp } from "../app";
import type { AppContext } from "../types/context";

describe("routes/search", () => {
  let app: Hono<AppContext>;
  let testUserId: string;
  let authHeaders: HeadersInit;

  beforeEach(async () => {
    resetDatabase();

    // Create test user
    const user = await createUser(db);
    testUserId = user.id;

    // Create auth headers with valid session cookie
    authHeaders = createAuthHeaders(testUserId);

    // Create the actual production app with all middleware
    app = createApp();
  });

  it("should render search page with results", async () => {
    await createCompletedArticle(db, testUserId, {
      title: "TypeScript Guide",
    });

    const res = await app.request("/search?q=typescript", {
      headers: authHeaders,
    });

    const html = await res.text();
    const doc = parseHtml(html);

    expect(res.status).toBe(200);
    expect(doc.querySelector("#search-input")).toBeTruthy();
    expect(html).toContain("TypeScript Guide");
  });
});
```

**Route testing best practices:**
- Use `createApp()` to test the full production app with all middleware
- Use `createAuthHeaders(userId)` to authenticate test requests
- Use `parseHtml()` from `test/fixtures` for DOM assertions (uses happy-dom)
- Pass `headers: authHeaders` to authenticated routes
- Don't pass headers for unauthenticated tests
- happy-dom is faster and lighter than jsdom for test assertions

### Testing with Dates (setSystemTime)

For date-based tests, always use `setSystemTime` from Bun to set a fixed system time. This eliminates flakiness and makes tests deterministic regardless of when they run or how slow the test environment is.

```typescript
import { beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { createSubscription, createUser } from "../../test/fixtures";
import { getAllowedFeaturesForUser } from "./subscription.service";

describe("subscription.service", () => {
  // Fix the current time to a known value for consistent testing
  const NOW = new Date("2024-06-15T12:00:00Z");

  beforeEach(() => {
    setSystemTime(NOW);
    resetDatabase();
  });

  it("should handle subscription expiring in 1 second", async () => {
    const user = await createUser(db);
    const oneSecondFromNow = new Date("2024-06-15T12:00:01Z");

    await createSubscription(db, user.id, {
      type: "full",
      expiresAt: oneSecondFromNow,
    });

    const features = await getAllowedFeaturesForUser(user.id);

    expect(features.summary).toBe(true);
  });
});
```

**Date testing best practices:**
- **Always use `setSystemTime`** in `beforeEach` for tests involving dates, timestamps, or expiration logic
- **Use static dates** - write dates as ISO strings (e.g., `"2024-06-15T12:00:00Z"`) instead of computing from `Date.now()`
- **Never use relative dates** - avoid `new Date(Date.now() + 1000)` in favor of `new Date("2024-06-15T12:00:01Z")`
- **Deterministic and readable** - static dates make tests easy to understand and debug
- **No flakiness** - tests work the same regardless of execution speed or actual wall clock time

## TypeScript Configuration

- **Strict mode** with `noUncheckedIndexedAccess`
- **JSX**: `react-jsx` with `hono/jsx` import source
- **Module resolution**: `bundler` mode (Bun-specific)
- **verbatimModuleSyntax**: Always use `import type` for type-only imports

```typescript
// CORRECT
import type { FC } from "hono/jsx";
import type { Article } from "../db/types";

// WRONG - will error with verbatimModuleSyntax
import { FC } from "hono/jsx";
```

## Code Style (Biome)

- 2-space indentation
- Double quotes for strings
- Recommended linting rules enabled
- Organize imports automatically

Run `bun run check` before committing.

## Authentication Flow

1. Web app generates token -> stores in `auth_tokens` with `userId = NULL`
2. User clicks Telegram deep link -> bot receives `/start login_{token}`
3. Bot validates token -> creates User + TelegramUser -> sets `userId` on token
4. Web app polls `/auth/check/{token}` -> returns success when `userId` populated
5. Tokens expire in 5 minutes, cleaned up hourly by cron

## LLM/TTS Integration

Providers are optional and configured via environment:

```typescript
import { getLLMProvider, isLLMAvailable } from "../lib/llm";
import { getTTSProvider, isTTSAvailable } from "../lib/tts";

// Check availability before use
if (isLLMAvailable()) {
  const provider = getLLMProvider();
  const tags = await provider.extractTags(content, existingTags);
}
```

Models used:
- Tag extraction: `claude-haiku-4-5`
- Summarization: `claude-sonnet-4-5`
- TTS: `eleven_flash_v2_5` (12 language-specific voices)

## Cron Jobs

All scheduled tasks are defined in `src/cron.ts`:
- **Retry Failed Articles** - Every 5 minutes
- **Cache Cleanup** - Daily at 3 AM (files older than CACHE_MAX_AGE_DAYS)
- **Auth Token Cleanup** - Hourly

Never define cron jobs elsewhere.

## Common Pitfalls

- Never access `process.env` directly - use the config module
- Never define cron jobs outside `src/cron.ts`
- Never write DB queries in routes/workers - use services
- Never use JavaScript redirects for HTMX - use `HX-Redirect` header
- Always normalize tags to lowercase before insert/search
- Always use `type="button"` on non-submit buttons
- Always use `import type` for type-only imports
- Never block bot handlers - spawn workers for heavy processing
- Never use inline `<script>` tags - use HTMX attributes
- Never use `<a role="button">` - use `<button>` for actions, `<a>` for navigation
- Spell "lateread" always lowercase
