# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lateread** is a self-hosted, privacy-focused read-later application. Users save articles via Telegram bot, articles are processed with AI for tagging, and consumed through a clean web interface with TTS and summarization features.

## Key Architecture Principles

### 1. Configuration-First Design
- **All configuration MUST go through `src/lib/config.ts`**
- Never access `process.env` directly in any other module
- Config module validates and type-checks all environment variables using Zod
- Import config as the FIRST import in `src/main.ts` before any other modules

### 2. Three-Tier Architecture

**Application Layer:**
- **Grammy Bot** (`src/bot/`): Receives messages via polling (not webhooks), handles auth commands, spawns workers
- **Hono Server** (`src/routes/`): SSR pages, API endpoints, HTMX routing
- **Bun Workers** (`src/workers/`): Background article processing (fetch, extract, tag, cache)

**Data Layer:**
- **SQLite + Drizzle ORM** (`src/db/schema.ts`): All database tables defined with abstraction for future Postgres migration
- **File System Cache** (`cache/articles/{uuid}.html`): Clean HTML content stored separately from metadata
- **Separation**: Article metadata in database, content in file cache

**External Services:**
- **LLM Provider** (operator chooses): Claude/OpenAI/Gemini/local via `src/lib/llm.ts` abstraction
- **Telegram Bot API**: Via Grammy framework

### 3. Module Coordination Pattern

**`src/main.ts`** is the orchestrator:
1. Loads `config` (MUST be first)
2. Initializes database connection
3. Runs migrations
4. Sets up Hono app and routes
5. Initializes bot
6. Starts cron jobs (`src/cron.ts`)
7. Starts HTTP server

**`src/cron.ts`** is the central registry for ALL scheduled tasks - never define cron jobs elsewhere.

### 4. Services Layer Pattern

**All database operations MUST go through services (`src/services/`):**
- Services encapsulate database logic and business rules
- Routes become thin controllers that only handle HTTP concerns
- Makes testing easier (can mock services)
- Improves code reusability across routes

**Service structure:**
```typescript
// src/services/articles.service.ts
export async function getArticlesWithTags(
  userId: string,
  filters: { archived?: boolean; tag?: string }
): Promise<ArticleWithTags[]> {
  // All DB queries and business logic here
}
```

**Route usage:**
```typescript
import { getArticlesWithTags } from "../services/articles.service";

articlesRouter.get("/articles", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId") as string;
  const articles = await getArticlesWithTags(userId, { archived: false });
  // ... render response
});
```

**Existing services:**
- `articles.service.ts`: Article CRUD, queries with tags, mark as read, archive
- `tags.service.ts`: Tag operations, get or create tags
- *(Add more as needed)*

**Guidelines:**
- Never write database queries directly in route handlers
- Services throw errors with descriptive messages
- Routes catch and translate service errors to HTTP responses
- Services are stateless functions (no classes unless necessary)

### 5. Authentication Middleware

**Use `requireAuth()` middleware for all protected routes:**
```typescript
import { requireAuth } from "../middleware/auth";

// For page routes (redirects to / if not authenticated)
app.get("/articles", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId") as string; // Available after middleware
  // ...
});

// For API routes (returns 401 JSON if not authenticated)
app.post("/api/articles/:id", requireAuth("json-401"), async (c) => {
  const userId = c.get("userId") as string;
  // ...
});
```

**Middleware strategies:**
- `requireAuth("redirect")`: Redirects to `/` - use for page routes
- `requireAuth("json-401")`: Returns `{error: "Unauthorized"}` 401 - use for API routes

**Benefits:**
- Consistent auth checks across all routes
- Reduces boilerplate (no manual session checks)
- Sets `userId` in context for route handlers
- Clear separation of concerns

### 6. HTMX Pattern (Hybrid Approach)
- Detect `hx-request` header (lowercase) in route handlers
- Return **full page with Layout** for direct navigation
- Return **partial content** for HTMX requests
- Progressive enhancement: works without JavaScript, enhanced with HTMX

### 7. Worker Architecture
- Use Bun's native Worker API (no imports needed for `self.onmessage`, `self.postMessage`)
- Workers receive `articleId` via message
- Full processing pipeline: fetch → parse → extract → tag (LLM) → cache → database update
- Workers post `{success: true/false, articleId, error?}` back to parent
- Non-blocking spawning from bot handlers (fire and forget with error handling)

### 8. Database Schema Critical Details
- **Tags stored lowercase**: Always normalize with `tag.toLowerCase()` before insert/search
- **Article status enum**: `pending → processing → completed` (or `failed → error` after retries)
- **Cascade deletes**: article_tags and article_summaries cascade when article deleted
- **User separation**: User table is auth-agnostic, TelegramUser links via foreign key

### 9. Authentication Flow (OTP via Telegram)
1. Web app generates token → stores in `auth_tokens` table with `userId = NULL`
2. User clicks Telegram deep link → bot receives `/login {token}`
3. Bot validates token → **creates User + TelegramUser records** → sets `userId` on token
4. Web app polls `/auth/check/{token}` → returns success when `userId` populated
5. Tokens expire in 5 minutes, cleaned up hourly

### 10. LLM Provider Strategy
- **No LLM SDKs in package.json by default**
- Operators install their chosen provider: `bun add @anthropic-ai/sdk` (or openai, etc.)
- Set `LLM_PROVIDER` and `LLM_API_KEY` in .env
- `src/lib/llm.ts` uses dynamic imports, throws helpful error if SDK missing

## Development Commands

**Using Bun** (not npm/node):
```bash
# Development server with watch mode
bun --watch src/main.ts

# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test src/lib/content-cache.test.ts

# Generate test coverage
bun test --coverage

# Copy frontend assets (htmx, pico) from node_modules to public/
bun run scripts/copy-assets.ts

# Run database migrations
bun run src/lib/db.ts  # Or dedicated migration script when created
```

**Package management:**
```bash
bun add <package>        # Add dependency
bun add -d <package>     # Add dev dependency
bun install              # Install all dependencies
```

## File System Conventions

### Cache Directory
- Path: `./cache/articles/` (configurable via `CACHE_DIR` env var)
- Format: `{articleId}.html` (UUID filenames)
- Managed by `src/lib/content-cache.ts` using Bun.file() API
- Auto-created on demand, cleaned up by cron (files older than 30 days)

### Test Files
- Co-located: `src/lib/content-cache.test.ts` next to `content-cache.ts`
- Use in-memory SQLite (`:memory:`) for database tests
- Fixtures in `test/fixtures.ts`, mocks in `test/mocks/`

## TypeScript Configuration
- **Strict mode enabled** - all code must type-check
- **JSX**: Uses `react-jsx` for Hono components
- **Module resolution**: `bundler` mode (Bun-specific)
- **No emit**: Bun runs TypeScript directly, no build step

## Critical Implementation Notes

### When Adding New Routes
1. Use `requireAuth()` middleware for protected routes (specify "redirect" or "json-401")
2. Get userId from context: `const userId = c.get("userId") as string`
3. Call service functions for all database operations
4. Check for `hx-request` header to return full page or partial
5. Return Layout-wrapped component for full page, partial for HTMX
6. Never use redirects for HTMX requests (breaks back button)

### When Working with Database
1. **NEVER write database queries in route handlers** - always use services
2. Create or use existing service functions in `src/services/`
3. Services use Drizzle query builder (never raw SQL unless necessary)
4. Use transactions for multi-table operations
5. Schema changes require migration via drizzle-kit
6. Use `bun:sqlite` (not node:sqlite3) for native SQLite

### When Spawning Workers
1. Worker files must be standalone (import all dependencies)
2. Use `new Worker('./workers/process-metadata.ts')`
3. Don't await worker completion in hot paths (bot message handlers)
4. Always handle worker errors and post results back

### When Implementing LLM Features
1. Never hardcode provider - use `getLLMProvider()` from `lib/llm.ts`
2. Pass existing tags to LLM for reuse (avoid duplicate tags)
3. Cache LLM results (summaries in `article_summaries` table)
4. Handle API errors gracefully - app must work if LLM fails

## Testing Strategy
- **Bun Test** (Jest-compatible API): `describe`, `it`, `expect`
- **Unit tests**: Library modules, pure functions
- **Integration tests**: Routes, workers, database operations
- **E2E tests**: Full user flows (auth → capture → read → summarize)
- **Mock external APIs**: Telegram, LLM providers (fixtures in `test/mocks/`)
- **Coverage target**: >80% overall, >90% for critical paths (auth, workers)

## Coding Style Guidelines

### TypeScript
- **Type imports**: Always use `import type` for type-only imports due to `verbatimModuleSyntax`
  ```typescript
  import type { FC } from "hono/jsx";
  import type { Context } from "hono";
  ```
- **Strict mode**: All code must type-check with strict mode enabled
- **No type assertions**: Prefer proper type checking over `as` casts

### Components
- **Extract reusable components**: If JSX is repeated more than twice, extract to a component
- **Component location**: Group related components in subdirectories (e.g., `components/auth/`)
- **Props interfaces**: Always define typed props interfaces for components
- **Functional components**: Use Hono's `FC` type for all components

### HTMX Patterns
- **HTMX-first**: Use HTMX for all dynamic interactions - avoid vanilla JavaScript
- **No inline scripts**: Never use `<script>` tags for behavior (exception: very rare cases like redirects)
- **HX-Redirect header**: Use `c.header("hx-redirect", "/path")` for redirects, not JavaScript
- **Polling**: Use `hx-trigger="load, every Xs"` for polling patterns
- **Target IDs**: Always specify unique IDs for `hx-target` to avoid conflicts
- **Conditional attributes**: Use spread operator for conditional HTMX attributes:
  ```tsx
  <footer
    {...(condition && {
      "hx-post": "/api/endpoint",
      "hx-trigger": "intersect once",
      "hx-swap": "none",
    })}
  >
  ```

### HTML Semantics
- **Buttons vs Links**:
  - Use `<button type="button">` for in-app actions (HTMX triggers)
  - Use `<a href="...">` for navigation (internal or external links)
  - Never use `<a role="button">` - remove the role attribute
- **Button types**: Always specify `type="button"` or `type="submit"` on buttons
- **Forms**: Use `method="post"` (lowercase) not `method="POST"`

### Styling
- **No emojis**: Never use emojis in code, comments, or console output
- **Spell "lateread"**: Always lowercase, never "Lateread" or "LateRead"

### Code Organization
- **DRY principle**: Extract repeated code into functions/components
- **File naming**: Use kebab-case for files (e.g., `auth-error.tsx`)
- **Export patterns**: Use named exports for utilities, default export for route handlers

## Common Pitfalls to Avoid
- ❌ Accessing `process.env` directly (use `config` module)
- ❌ Defining cron jobs outside `src/cron.ts`
- ❌ Using Node.js APIs (`node:fs`) instead of Bun APIs (`Bun.file()`)
- ❌ Forgetting to normalize tag names to lowercase
- ❌ Blocking bot message handlers with heavy processing (use workers)
- ❌ Using JavaScript redirects instead of HX-Redirect header
- ❌ Installing all LLM SDKs (only install chosen provider)
- ❌ Using `<a role="button">` instead of proper semantic HTML
- ❌ Forgetting `type="button"` on button elements
- ❌ Writing vanilla JavaScript when HTMX can handle it
- ❌ Repeating JSX patterns instead of extracting components

## Implementation Phases

Project follows **vertical slice approach** - each phase delivers complete, working features:

- **Phase 0**: Foundation (config, database, structure)
- **Phase 1**: Authentication flow (Telegram OTP)
- **Phase 2**: Article capture (bot handlers, workers, tagging)
- **Phase 3**: Article reading (web UI, reader view)
- **Phase 4**: AI features (summary generation)
- **Phase 5**: Additional features (archive, search, TTS)
- **Phase 6**: Background jobs (cron, retry, cleanup)
- **Phase 7**: Testing (comprehensive test suite)
- **Phase 8**: Deployment (Docker, Railway, CI/CD)

See `docs/IMPLEMENTATION_PLAN_v1.md` for detailed task breakdowns.

## Documentation References

- **`docs/DESIGN_v1.md`**: Complete technical specification (2500+ lines)
  - Data model, module specs, flows, API endpoints
  - Refer here for detailed implementation guidance
- **`docs/IMPLEMENTATION_PLAN_v1.md`**: 8-phase implementation roadmap
  - Task checklists, dependencies, testing requirements
  - Use for project planning and progress tracking
