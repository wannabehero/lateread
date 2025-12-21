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

### 4. HTMX Pattern (Hybrid Approach)
- Detect `hx-request` header (lowercase) in route handlers
- Return **full page with Layout** for direct navigation
- Return **partial content** for HTMX requests
- Progressive enhancement: works without JavaScript, enhanced with HTMX

### 5. Worker Architecture
- Use Bun's native Worker API (no imports needed for `self.onmessage`, `self.postMessage`)
- Workers receive `articleId` via message
- Full processing pipeline: fetch → parse → extract → tag (LLM) → cache → database update
- Workers post `{success: true/false, articleId, error?}` back to parent
- Non-blocking spawning from bot handlers (fire and forget with error handling)

### 6. Database Schema Critical Details
- **Tags stored lowercase**: Always normalize with `tag.toLowerCase()` before insert/search
- **Article status enum**: `pending → processing → completed` (or `failed → error` after retries)
- **Cascade deletes**: article_tags and article_summaries cascade when article deleted
- **User separation**: User table is auth-agnostic, TelegramUser links via foreign key

### 7. Authentication Flow (OTP via Telegram)
1. Web app generates token → stores in `auth_tokens` table with `userId = NULL`
2. User clicks Telegram deep link → bot receives `/login {token}`
3. Bot validates token → **creates User + TelegramUser records** → sets `userId` on token
4. Web app polls `/auth/check/{token}` → returns success when `userId` populated
5. Tokens expire in 5 minutes, cleaned up hourly

### 8. LLM Provider Strategy
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
1. Check for `hx-request` header in handler
2. Use session middleware for auth-protected routes
3. Return Layout-wrapped component for full page, partial for HTMX
4. Never use redirects for HTMX requests (breaks back button)

### When Working with Database
1. Always use Drizzle query builder (never raw SQL unless necessary)
2. Use transactions for multi-table operations
3. Schema changes require migration via drizzle-kit
4. Use `bun:sqlite` (not node:sqlite3) for native SQLite

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

## Common Pitfalls to Avoid
- ❌ Accessing `process.env` directly (use `config` module)
- ❌ Defining cron jobs outside `src/cron.ts`
- ❌ Using Node.js APIs (`node:fs`) instead of Bun APIs (`Bun.file()`)
- ❌ Forgetting to normalize tag names to lowercase
- ❌ Blocking bot message handlers with heavy processing (use workers)
- ❌ Returning redirects for HTMX requests (breaks navigation)
- ❌ Installing all LLM SDKs (only install chosen provider)

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

See `docs/IMPLEMENTATION_PLAN.md` for detailed task breakdowns.

## Documentation References

- **`docs/DESIGN.md`**: Complete technical specification (2500+ lines)
  - Data model, module specs, flows, API endpoints
  - Refer here for detailed implementation guidance
- **`docs/IMPLEMENTATION_PLAN.md`**: 8-phase implementation roadmap
  - Task checklists, dependencies, testing requirements
  - Use for project planning and progress tracking
- spell lateread as lowercase