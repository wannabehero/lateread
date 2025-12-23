# Lateread - Implementation Plan

**Approach**: Vertical Slices (complete user flows)
**LLM Provider**: Claude (Anthropic)
**Scope**: Full implementation
**Last Updated**: 2025-12-21

---

## Overview

This implementation plan breaks down the Lateread project into 8 phases, each representing a complete vertical slice of functionality. Each phase delivers working, testable features that build upon previous phases.

---

## Phase 0: Project Foundation ✅ COMPLETE

**Goal**: Set up project structure, dependencies, configuration, and database layer.

### Tasks

#### 0.1 Project Initialization
- [x] Initialize Bun project: `bun init`
- [x] Create directory structure:
  ```
  src/
    ├── main.ts
    ├── cron.ts
    ├── bot/
    ├── routes/
    ├── components/
    ├── workers/
    ├── lib/
    └── db/
  test/
  public/
  scripts/
  cache/articles/
  ```
- [x] Create `.env.example` with all required environment variables
- [x] Create `.gitignore` (node_modules, .env, cache/, data/, coverage/)

#### 0.2 Dependencies Installation
```bash
# Core dependencies
bun add hono
bun add grammy
bun add drizzle-orm
bun add drizzle-kit -d
bun add jsdom @mozilla/readability
bun add @types/jsdom -d
bun add croner
bun add zod

# Frontend dependencies (will be copied to public/)
# Kept as production deps for Docker build simplicity
# TODO: Optimize with multi-stage Docker build (see DESIGN.md Technical Improvements #8)
bun add htmx.org
bun add @picocss/pico

# LLM Provider SDK (operator chooses one based on their preference)
# Install ONLY the provider you'll use:
bun add @anthropic-ai/sdk          # For Claude (recommended)
# bun add openai                   # For OpenAI
# bun add @google/generative-ai    # For Gemini
# (none needed for local models)

# Set LLM_PROVIDER and LLM_API_KEY in .env accordingly
```

#### 0.3 Configuration Module (`src/lib/config.ts`)
- [x] Create Zod schema for environment variables
- [x] Define all config fields with types:
  - Server: PORT, NODE_ENV
  - Database: DATABASE_URL
  - Telegram: TELEGRAM_BOT_TOKEN, BOT_USERNAME
  - LLM: LLM_PROVIDER, LLM_API_KEY
  - Auth: SESSION_SECRET, SESSION_MAX_AGE_DAYS
  - Cache: CACHE_DIR, CACHE_MAX_AGE_DAYS
  - Processing: PROCESSING_TIMEOUT_SECONDS, MAX_RETRY_ATTEMPTS, RETRY_DELAY_MINUTES
- [x] Parse and validate `process.env` on module import (using `z.treeifyError()` for clean error output)
- [x] Export typed `config` object
- [x] Provide sensible defaults for optional values

#### 0.4 Database Schema (`src/db/schema.ts`)
- [x] Define `users` table
- [x] Define `telegramUsers` table
- [x] Define `articles` table with status enum
- [x] Define `articleSummaries` table
- [x] Define `tags` table
- [x] Define `articleTags` junction table
- [x] Define `authTokens` table
- [x] Add indexes per design doc
- [x] Export all table definitions

#### 0.5 Database Connection (`src/lib/db.ts`)
- [x] Import config module
- [x] Create SQLite connection using `bun:sqlite`
- [x] Initialize Drizzle with SQLite dialect
- [x] Enable WAL mode for better concurrency
- [x] Export typed `db` instance
- [x] Create `runMigrations()` function using drizzle-kit

#### 0.6 Asset Copy Script (`scripts/copy-assets.ts`)
- [x] Create script to copy HTMX from node_modules to public/
- [x] Copy Pico CSS from node_modules to public/
- [x] Ensure public/ directory exists
- [x] Log success message
- [x] Add `postinstall` script to package.json for automatic asset copying

#### 0.7 TypeScript Configuration
- [x] Create `tsconfig.json` with strict mode
- [x] Configure JSX for Hono (jsxImportSource: "hono/jsx")
- [x] Set module resolution to bundler
- [x] Configure paths for absolute imports

#### 0.8 Additional Setup (Completed)
- [x] Create `drizzle.config.ts` for migrations
- [x] Generate initial database migration
- [x] Add npm scripts to package.json (dev, start, test, db:*, copy-assets)
- [x] Create `public/styles.css` with custom styles
- [x] Exclude generated assets from git (htmx.min.js, pico.min.css)
- [x] Add `.gitkeep` to preserve public/ directory structure
- [x] Remove all emojis from code and console statements

**Deliverable**: Project skeleton with working database connection and configuration.

**Testing**:
- ✅ Run `bun run src/lib/config.ts` - validates config without errors
- ✅ Run `bun run src/lib/db.ts` - creates database file
- ✅ Run migrations - creates all tables
- ✅ All tests pass with clean console output (no emojis, no warnings)

---

## Phase 1: Authentication Flow ✅ COMPLETE

**Goal**: Complete Telegram-based authentication from landing page to logged-in session.

### Tasks

#### 1.1 Auth Library (`src/lib/auth.ts`)
- [x] Implement `createAuthToken()`:
  - Generate UUID token
  - Store in database with 5-minute expiration
  - userId starts as NULL (not claimed yet)
  - Return token and formatted Telegram deep link (`/start login_{token}`)
- [x] Implement `claimAuthToken()`:
  - Validate token exists and not expired
  - Create User record (new!) or use existing
  - Create TelegramUser record with telegramId and username
  - Update token with userId
  - Return user object
- [x] Implement `cleanupExpiredTokens()`:
  - Delete tokens where expiresAt < NOW()
  - Return count of deleted tokens
- [x] Export `TOKEN_EXPIRATION_MINUTES` constant
- [x] Implement `getAuthTokenStatus()` for polling

#### 1.2 Layout Component (`src/components/Layout.tsx`)
- [x] Create base HTML layout with:
  - `<head>` with meta tags, title, Pico CSS conditional theme
  - HTMX script tag
  - Custom styles link
  - `<header>` with navigation (Home, Unread, Archive)
  - `<main>` slot for children
  - `<footer>` with app info
- [x] Add `hx-boost="true"` to navigation links
- [x] Accept `title`, `children`, `isAuthenticated`, `currentPath` props
- [x] Use Pico CSS conditional theme for dark mode support

#### 1.3 Auth Routes (`src/routes/auth.tsx`)
- [x] Create Hono router instance
- [x] `GET /` (when not authenticated):
  - Check session cookie for user ID
  - If not authenticated: render login page with "Login with Telegram" button
  - If authenticated: redirect to `/articles?status=unread`
- [x] `POST /auth/telegram`:
  - Call `createAuthToken()`
  - Return HTMX fragment with Telegram deep link and polling component
- [x] `GET /auth/check/:token`:
  - Query auth token from database
  - Check if expired → return AuthError component
  - Check if userId is NULL → return AuthPolling component (pending)
  - If userId exists → set session cookie, return HX-Redirect header
- [x] `POST /auth/logout`:
  - Clear session cookie
  - Redirect to `/`

#### 1.4 Auth Components (HTMX-based, no vanilla JS)
- [x] `AuthError` component (`src/components/auth/AuthError.tsx`):
  - Reusable error message with retry button
  - Props: message, buttonText
- [x] `AuthPolling` component (`src/components/auth/AuthPolling.tsx`):
  - HTMX-based polling with configurable triggers
  - Props: token, message, immediate
  - Initial polling: `load, every 2s`
  - Continuation polling: `load delay:2s`
- [x] Use HX-Redirect header instead of JavaScript redirects

#### 1.5 Bot Setup (`src/bot/index.ts`)
- [x] Import Grammy and config
- [x] Create Bot instance with token from config
- [x] Store bot username from config
- [x] Export `setupBot()` function
- [x] Export `bot` instance
- [x] Use polling mode (not webhooks)
- [x] Add error handler
- [x] Export `startBot()` and `stopBot()` functions

#### 1.6 Bot Auth Handler (`src/bot/handlers.ts`)
- [x] Implement `/start` command:
  - Handle deep link payload (`login_{token}`)
  - Send welcome message for regular start
  - Explain how to use the bot
- [x] Implement `/login {token}` command:
  - Extract token from command text
  - Validate token via `claimAuthToken()`
  - Pass telegramId, username, firstName, lastName from message
  - If valid: reply "Login successful!"
  - If invalid/expired: reply with error message
- [x] Implement `/help` command with full feature list
- [x] Register handlers in `registerHandlers(bot)` function

#### 1.7 Session Middleware (`src/lib/session.ts`)
- [x] Create session helpers using signed cookies
- [x] Use SESSION_SECRET from config with Bun.hash for signing
- [x] Set cookie expiration from SESSION_MAX_AGE_DAYS
- [x] Export `getSession()`, `setSession()`, `clearSession()` helpers
- [x] HTTP-only, secure (in production), SameSite=Lax cookies

#### 1.8 Main Entry Point - Initial Version (`src/main.ts`)
- [x] Import config first (before other modules)
- [x] Initialize database connection
- [x] Run migrations
- [x] Create Hono app
- [x] Add request logger middleware
- [x] Add static file serving for `/public/*`
- [x] Register auth routes
- [x] Setup Telegram bot
- [x] Start bot polling
- [x] Start HTTP server on configured PORT
- [x] Log startup message with URLs
- [x] Add graceful shutdown handler (SIGINT)

**Deliverable**: Complete authentication flow - user can log in via Telegram and get session.

**Testing**:
- Manual: Visit `/`, click "Login with Telegram", complete flow
- Unit test: `auth.test.ts` - token creation, claiming, expiration
- Integration test: Full auth flow with mock Telegram

---

## Phase 2: Article Capture Flow ✅ COMPLETE

**Goal**: User can send URLs to Telegram bot and articles are captured in database.

### Tasks

#### 2.1 Bot Message Handlers (`src/bot/handlers.ts` - extend)
- [x] Add URL extraction helper:
  - Parse message text for URLs
  - Support forwarded messages
  - Extract first URL only (ignore others)
  - Return URL or null
- [x] Add message handler:
  - Check if message contains URL
  - Query TelegramUser by telegramId from message
  - If user not found: reply "Please log in first at https://lateread.app"
  - Extract first URL from message
  - Create article record in database:
    - Generate UUID
    - Set userId from telegram user
    - Set url
    - Set status = 'pending'
    - Set processingAttempts = 0
  - React to message with 👀 emoji
  - Spawn worker with article ID (non-blocking)
  - Handle worker result → update reaction to 👍 or 👎

#### 2.2 Content Cache Module (`src/lib/content-cache.ts`)
- [x] Create `ContentCache` class:
  - `get(articleId)`: Read HTML from cache file
  - `set(articleId, content)`: Write HTML to cache file
  - `delete(articleId)`: Delete cache file
  - `exists(articleId)`: Check if cache file exists
- [x] Use Bun.file() API for all operations
- [x] Use config.CACHE_DIR for directory path
- [x] File naming: `{uuid}.html`
- [x] UTF-8 encoding
- [x] Create directory on-demand if missing
- [x] Implement `cleanupOldCache()` function:
  - Scan all files in cache directory
  - Delete files older than CACHE_MAX_AGE_DAYS
  - Log count of deleted files
- [x] Export ContentCache instance and cleanup function

#### 2.3 Readability Wrapper (`src/lib/readability.ts`)
- [x] Implement `extractCleanContent(url)`:
  - Fetch URL with timeout (30 seconds)
  - Set custom user agent
  - Follow up to 5 redirects
  - Parse HTML with JSDOM
  - Extract OpenGraph metadata (title, description, image, site_name)
  - Fallback to regular meta tags if OG missing
  - Run Readability on parsed document
  - Extract clean HTML content
  - Extract plain text content
  - Return structured result object
- [x] Error handling:
  - Network errors (timeout, DNS, connection)
  - Invalid HTML
  - Readability failures (non-article pages)
  - Return partial data or throw descriptive error

#### 2.4 LLM Abstraction - Base (`src/lib/llm.ts`)
- [x] Define `LLMProvider` interface:
  - `extractTags(content, existingTags)`: Promise<{tags, confidence}>
  - `summarize(content)`: Promise<{oneSentence, oneParagraph, long}>
- [x] Implement `ClaudeProvider`:
  - Install @anthropic-ai/sdk
  - Use Claude Haiku (claude-3-5-haiku-20241022) for tag extraction
  - Use Claude Sonnet (claude-3-5-sonnet-20241022) for summaries
  - Implement tag extraction prompt:
    - Provide article content (truncate to ~10k words)
    - Provide existing tags for reuse
    - Request JSON output: {tags: string[], confidence: number}
    - Limit to 5-10 tags
    - Prefer existing tags when semantically similar
  - Implement summary prompt (placeholder for now, will implement in Phase 4):
    - Request structured JSON with three lengths
    - Return mock data for now
- [x] Implement `getLLMProvider()`:
  - Check config.LLM_PROVIDER
  - Return ClaudeProvider instance
  - Throw error if SDK not installed
- [x] Error handling:
  - Catch API errors
  - Log errors with provider name
  - Return empty tags on error

#### 2.5 Article Worker (`src/workers/process-metadata.ts`)
- [x] Implement worker using Bun's Worker API
- [x] Set up `self.onmessage` handler
- [x] Processing steps:
  1. Receive articleId from message
  2. Query article from database
  3. Update status to 'processing', increment processingAttempts
  4. Fetch URL content using readability wrapper
  5. Extract metadata and clean content
  6. Generate tags using LLM provider:
     - Load user's existing tags
     - Call extractTags() with content and existing tags
     - For each returned tag:
       - Check if exists (case-insensitive)
       - Create new tag if needed (autoGenerated = true)
       - Collect tag IDs
  7. Cache clean HTML using ContentCache
  8. Update database in transaction:
     - Set title, description, imageUrl, siteName
     - Set status = 'completed'
     - Set processedAt = NOW()
     - Delete existing article-tag associations
     - Insert new article-tag associations
  9. Post success message to parent thread
- [x] Error handling:
  - Catch all errors
  - Update article status to 'failed'
  - Store error in lastError field
  - Post error message to parent thread
- [x] Overall timeout: 60 seconds

#### 2.6 Worker Spawning Helper (`src/lib/worker.ts`)
- [x] Create helper to spawn worker with article ID
- [x] Handle worker messages (success/failure)
- [x] Update Telegram reactions based on result
- [x] Non-blocking execution (fire and forget with error handling)
- [x] Export `spawnArticleWorker({articleId, telegramChatId, messageId})` function (using object params)

#### 2.7 Update Main Entry (`src/main.ts` - extend)
- [x] Import bot handlers
- [x] Register bot handlers after bot setup
- [x] Fix config import to be first (before all other imports)

**Deliverable**: User can send URLs to bot, articles are captured and processed automatically.

**Testing**:
- Manual: Send URL to bot, check database, check cache file
- Unit test: `content-cache.test.ts`, `readability.test.ts`
- Integration test: `process-metadata.test.ts` - full worker flow with mocks

---

## Phase 3: Article Reading Flow ✅ COMPLETE

**Goal**: User can view list of articles and read them in clean interface.

### Architectural Improvements Implemented

During Phase 3, we implemented several architectural patterns beyond the original plan:

#### Services Layer
- [x] Created `src/services/articles.service.ts` - All article database operations
- [x] Created `src/services/tags.service.ts` - Tag operations
- [x] Created `src/services/content.service.ts` - Content cache management
- [x] Routes are now thin controllers, all DB logic in services
- [x] Used `getTableColumns()` from Drizzle to avoid column repetition
- [x] Implemented array destructuring pattern for `.limit(1)` queries

#### Auth Middleware
- [x] Created `src/middleware/auth.ts` with `requireAuth(strategy)` function
- [x] Strategy parameter: "redirect" for pages, "json-401" for API
- [x] Eliminates manual session checks in every route
- [x] Sets `userId` in typed context for route handlers

#### Typed Context
- [x] Created `src/types/context.ts` with `AppContext` and `AppVariables`
- [x] All Hono instances use `Hono<AppContext>`
- [x] Full type safety for `c.get("userId")` - no casts needed
- [x] Extensible for future context variables

#### Archive-First Organization
- [x] Simplified from read/unread to archive/non-archive model
- [x] `/` and `/articles` show all non-archived articles
- [x] `readAt` tracked for future statistics but not used for filtering
- [x] Archive is the primary organization tool

#### Query Optimizations
- [x] SQLite JSON aggregation with `json_group_array()` and `COALESCE()`
- [x] Composite index usage: tags filtered by `(userId, name)` for efficiency
- [x] Single query for articles with tags (eliminated N+1 queries)
- [x] 50 articles: reduced from 51 queries to 1 query (98% reduction)

### Tasks

#### 3.1 Home Route (`src/routes/home.tsx`)
- [x] Separated from auth routes into dedicated file
- [x] `GET /` shows article list when authenticated
- [x] Shows login page when not authenticated
- [x] No redirect - renders in place

#### 3.2 Article Routes (`src/routes/articles.tsx`)
- [x] Create Hono router instance with typed context
- [x] Implement HTMX detection helper (checks `hx-request` header)
- [x] Implement render helper (full layout or partial)
- [x] `GET /articles`:
  - [x] Parse query params: status (all|archived), tag
  - [x] Use services layer for all DB operations
  - [x] Filter by userId, archived status, tag
  - [x] Order by createdAt DESC, limit 50
  - [x] Tags loaded via JSON aggregation (single query)
  - [x] Return full page or partial based on HTMX
- [x] `GET /articles/:id`:
  - [x] Use service to get article by ID
  - [x] Use content service for cache management
  - [x] On-demand fetching if cache miss
  - [x] Error handling with fallback to original URL
  - [x] Return full page or partial

#### 3.3 ArticleCard Component (`src/components/ArticleCard.tsx`)
- [x] Accept article prop with tags and archived status
- [x] Accept status prop for view context
- [x] Render structure with image, title, description, tags, actions
- [x] Context-aware tag URLs (preserve archive status in links)
- [x] "Read" button with hx-boost
- [x] Archive/Unarchive button (conditional text based on status)
- [x] Styling using Pico CSS classes

#### 3.4 ArticleList Component (`src/components/ArticleList.tsx`)
- [x] Accept articles array, status, and tag props
- [x] Render grid with ID for OOB swaps
- [x] Pass status to ArticleCard for context
- [x] Empty state with context-aware messages
- [x] Responsive grid layout

#### 3.5 EmptyState Component (`src/components/EmptyState.tsx`)
- [x] Reusable component for empty states
- [x] Accept message prop
- [x] Used by ArticleList and API OOB swaps

#### 3.6 TagBadge Component (`src/components/TagBadge.tsx`)
- [x] Accept name and href props
- [x] Render badge with tag name
- [x] Regular link (no hx-boost) for full page navigation
- [x] Styling: small badge/pill design

#### 3.7 ReaderView Component (`src/components/ReaderView.tsx`)
- [x] Accept article and content props
- [x] Article header with title, site name, original link, tags
- [x] Summary section placeholder (Phase 4)
- [x] Content area with clean HTML rendering
- [x] Auto-mark-as-read using conditional HTMX attributes on footer
- [x] Archive button in footer
- [x] Clean, readable typography

#### 3.8 API Routes (`src/routes/api.tsx`)
- [x] Create Hono router with typed context
- [x] `POST /api/articles/:id/read`:
  - [x] Use service to mark as read
  - [x] Return 204 No Content
- [x] `POST /api/articles/:id/archive`:
  - [x] Toggle archive status via service
  - [x] Count remaining articles in current view
  - [x] Return empty div to remove card
  - [x] OOB swap with EmptyState if last article
- [x] `POST /api/articles/:id/summarize` (placeholder for Phase 4)

#### 3.9 Static File Serving
- [x] Serve HTMX, Pico CSS from `/public`
- [x] Custom CSS (`public/styles.css`) with:
  - [x] Reader view typography
  - [x] Article card styling
  - [x] Tag badge styling
  - [x] Responsive grid layout

#### 3.10 Main Entry Updates
- [x] Register home routes
- [x] Register auth routes
- [x] Register article routes
- [x] Register API routes
- [x] Static file serving configured

**Deliverable**: User can browse articles, filter by tags/archive, read with clean formatting, and organize via archive.

**Key Features**:
- Archive-first organization (primary filter)
- Context-aware tag filtering (preserves archive status)
- OOB swaps for dynamic empty states
- Auto-mark-as-read on scroll
- Type-safe context throughout
- Services layer for all DB operations

**Testing**:
- Manual: Browse articles, click tags, archive/unarchive, read articles
- All routes tested with real data
- HTMX interactions verified
- Empty states tested for all views

---

## Phase 4: AI Features (Tagging & Summaries) ✅ COMPLETE

**Goal**: Articles auto-tag during processing, summaries available on-demand.

### Completed Tasks

#### 4.1 Complete Tag Extraction in Worker
- [x] Verified tag extraction in worker (implemented in Phase 2)
- [x] Tested with real Claude API
- [x] LLM prompts refactored with system prompts
- [x] Edge cases handled with fallback values

#### 4.2 Tag Display in Article List
- [x] ArticleCard renders tags correctly (implemented in Phase 3)
- [x] Tag click navigation working
- [x] Tags styled with badges

#### 4.3 Tag Filtering
- [x] `GET /articles` route handles tag filtering (implemented in Phase 3)
- [x] Tag filter UI implemented (click tag badges)
- [x] Context-aware tag URLs preserve archive status

#### 4.4 Summary Generation
- [x] Implemented `summarize(content)` method in ClaudeProvider
- [x] Uses Claude Sonnet 4.5
- [x] Generates three summary formats (one sentence, one paragraph, detailed)
- [x] System + user prompt pattern for better results
- [x] Error handling with descriptive messages

#### 4.5 Summary API Route
- [x] `POST /api/articles/:id/summarize` implemented
- [x] Checks for cached summaries first
- [x] Generates and stores new summaries on-demand
- [x] Returns SummaryView component
- [x] Error handling with fallback UI

#### 4.6 Summary Display Component
- [x] Created `SummaryView.tsx` component
- [x] Displays all three summary formats
- [x] Detailed summary in collapsible `<details>` element
- [x] Styled with CSS

#### 4.7 Update ReaderView
- [x] "Summarize Article" button with HTMX
- [x] Loading state with spinner animation
- [x] Button disables during request
- [x] Summary appears in #summaries target

### Additional Improvements Made
- [x] Refactored LLM library to use Anthropic SDK directly (no dynamic imports)
- [x] Extracted system prompts to `src/lib/llm-prompts.ts`
- [x] Created `extractJsonFromResponse()` helper with tests
- [x] Added comprehensive tests in `src/lib/llm.test.ts` (8 tests, all passing)
- [x] Renamed `LLM_API_KEY` to `ANTHROPIC_API_KEY` for clarity
- [x] Increased server `idleTimeout` to 120s for long LLM requests
- [x] Fixed HTMX navigation (removed hx-boost from article links)
- [x] Added loading spinner to Summarize button
- [x] Added comprehensive logging throughout bot-to-worker flow

**Deliverable**: Articles auto-tag during processing, users can generate summaries on-demand. ✅

**Testing**:
- ✅ Manual testing completed
- ✅ Unit tests: `llm.test.ts` - JSON extraction (8 tests passing)
- ✅ Type checking passes
- ✅ All features working end-to-end

---

## Phase 5: Additional Features (Archive, Search, TTS) ✅ COMPLETE

**Goal**: Add archive, tag filtering, search, and TTS functionality.

### Tasks

#### 5.1 Archive Functionality
- [ ] `POST /articles/:id/archive` in API routes:
  - Toggle article.archived boolean
  - Return updated article card HTML
- [ ] Update ArticleCard component:
  - Add "Archive" button (or "Unarchive" if already archived)
  - HTMX attributes: `hx-post="/articles/:id/archive"`, `hx-swap="outerHTML"`
- [ ] Update ReaderView component:
  - Add Archive button in footer
  - Same HTMX attributes
- [ ] Update article list route:
  - Default to `?status=unread` (archived = false)
  - Support `?status=archived` (archived = true)
- [ ] Add navigation links:
  - "Unread" → `/articles?status=unread`
  - "Archive" → `/articles?status=archived`
- [ ] Update Layout navigation with active state

#### 5.2 Search Functionality ✅ COMPLETE
- [x] Enhanced `/articles` route to handle `q` query parameter:
  - Parse `q` query param
  - Search article title, description, AND summaries (LIKE %query%)
  - Search cached content using ripgrep
  - Combine results with OR logic
  - Return article list HTML (full page or partial)
- [x] Add search form to articles list:
  - Input field with debounce (500ms)
  - Clear button (appears when query present)
  - HTMX attributes:
    - `hx-get="/articles"`
    - `hx-target="#article-container"`
    - `hx-trigger="submit, keyup changed delay:500ms from:#search-input"`
    - `hx-push-url="true"` for URL updates
  - Status preservation during search
- [x] Empty state for no search results
- [x] User-specific cache directories for privacy:
  - Cache structure: `cache/articles/{userId}/{articleId}.html`
  - Ripgrep searches only user's directory
  - Updated ContentCache class with userId parameter
  - Updated all cache operations (get, set, delete, exists)
  - Updated worker to use new cache structure
  - Updated cleanup function to scan user subdirectories
- [x] Comprehensive search coverage:
  - Database: title, description, all summary fields
  - Cached content: full article HTML via ripgrep
  - Privacy-safe: users can only search their own articles
- [x] Code quality improvements:
  - Extracted `buildArticleConditions()` helper (DRY)
  - Moved content search to `content.service.ts`
  - Added styling for search form
- [x] Docker: Install ripgrep in Dockerfile

#### 5.3 TTS Implementation ✅ COMPLETE
- [x] Created TtsControls component (`src/components/TtsControls.tsx`):
  - "Listen" button to start playback
  - Play/Pause/Stop controls
  - Speed control (0.75x, 1x, 1.25x, 1.5x, 2x)
  - Voice selector (system voices)
- [x] Extracted JavaScript to external file (`public/scripts/tts-controls.js`):
  - Extract text from `.reader-content` div
  - Create SpeechSynthesisUtterance with Web Speech API
  - Handle play, pause, stop events
  - Dynamic voice loading (async with voiceschanged event)
  - Settings changes during playback (restarts smoothly)
  - Proper callback cleanup to prevent state corruption
- [x] CSS styling for controls (`public/styles.css`):
  - Inline position above article content
  - Clear button states (Play/Pause toggle)
  - Mobile-friendly (responsive, stacks on small screens)
  - Consistent with app theme and dark mode
- [x] Integrated into ReaderView:
  - Added `<TtsControls />` component
  - Positioned between summary section and article content
  - Works with any article content

#### 5.4 PWA Manifest ✅ COMPLETE
- [x] Create `public/manifest.json`:
  - name: "lateread"
  - short_name: "lateread"
  - description: "Privacy-focused read-later app"
  - icons: 9 sizes (48, 72, 96, 144, 152, 180, 192, 512)
  - start_url: "/"
  - display: "standalone"
  - theme_color: #1095c1
  - background_color: #ffffff
  - maskable icons for adaptive display
- [x] Add manifest link to Layout head
- [x] Create favicon and app icons:
  - Generated 9 icon sizes from 900x900 source
  - Created favicon.ico
  - Added iOS Safari specific meta tags
  - Added viewport-fit=cover for notched devices
  - Added apple-touch-icon links

#### 5.5 Additional UI Polish ✅ COMPLETE
- [x] Empty states for all list views
- [x] Loading states (HTMX indicators)
- [x] Error states (HTMX error handling)
- [x] Responsive design checks:
  - Mobile navigation
  - Tablet layout
  - Desktop layout
  - Reduced mobile padding (0.25rem)
- [x] Dark mode support (Pico CSS includes this)
- [x] Toast notifications for user feedback
- [x] Hide Archive button when already archived

**Deliverable**: Full-featured reading experience with archive, search, and TTS.

**Testing**:
- Manual: Test all features on different devices
- Integration test: Archive and search routes

---

## Phase 6: Background Jobs

**Goal**: Set up cron jobs for retry, cleanup, and maintenance tasks.

### Tasks

#### 6.1 Retry Worker (`src/workers/retry.ts`)
- [x] Implement `retryFailedArticles()`:
  - Query stuck articles:
    - status IN ('pending', 'processing', 'failed')
    - updatedAt < NOW() - RETRY_DELAY_MINUTES
    - processingAttempts < MAX_RETRY_ATTEMPTS
  - For each article:
    - Log retry attempt
    - Spawn worker with article ID
    - Non-blocking (don't await)
  - Query exhausted articles:
    - status != 'completed'
    - processingAttempts >= MAX_RETRY_ATTEMPTS
  - Update to status = 'error', lastError = "Max retries exceeded"
  - Log results (count retried, count marked error)
- [x] Export function

#### 6.2 Cron Registry (`src/cron.ts`)
- [x] Import croner
- [x] Import all cron job functions:
  - `retryFailedArticles` from workers/retry
  - `cleanupOldCache` from lib/content-cache
  - `cleanupExpiredTokens` from lib/auth
- [x] Implement `startCrons()`:
  - Schedule retry job: every 5 minutes
  - Schedule cache cleanup: daily at 3am
  - Schedule token cleanup: hourly
  - Log each job registration
- [x] Export function

#### 6.3 Update Main Entry (`src/main.ts` - extend)
- [x] Import and call `startCrons()` after server starts
- [x] Log "Cron jobs started"

#### 6.4 Health Check Endpoint
- [x] Add `GET /health` route:
  - Return JSON: {status: 'ok', timestamp: Date.now()}
  - Use for monitoring
- [x] Add `GET /health/db` route:
  - Query database (simple SELECT 1)
  - Return {status: 'ok', database: 'connected'}
  - Return error if database unreachable

**Deliverable**: Background jobs running automatically for maintenance.

**Testing**:
- Unit test: `retry.test.ts` - retry logic
- Integration test: Run cron manually, verify execution
- Manual: Wait for cron execution, check logs

---

## Phase 7: Testing ✅ UNIT TESTS COMPLETE

**Goal**: Comprehensive test coverage for all modules.

**Status**: Unit tests completed (134 tests passing, 74.29% function coverage, 78.54% line coverage)

### Tasks

#### 7.1 Test Setup ✅
- [x] Create `test/setup.ts`:
  - Helper to create in-memory SQLite database
  - Run migrations on test database
  - Clean up after tests
- [x] Create `test/fixtures.ts`:
  - User creation helper
  - Article creation helper
  - Tag creation helper
  - Auth token creation helper
  - Mock HTML content
  - Wait/polling helper
- [x] Create `test/mocks/llm.ts`:
  - Mock LLM provider with configurable responses
  - Mock tag extraction
  - Mock summarization
- [x] Create `test/mocks/telegram.ts`:
  - Mock bot messages
  - Mock bot commands

#### 7.2 Unit Tests - Library Modules ✅
- [x] `lib/config.test.ts` (19 tests):
  - Valid config parsing
  - Missing required fields throw errors
  - Defaults applied correctly
  - Type coercion works
- [x] `lib/content-cache.test.ts` (20 tests):
  - Save and retrieve content
  - Return null for non-existent
  - Handle unicode/emojis
  - Create directory automatically
  - Delete by ID
  - Cleanup old files
  - Preserve recent files
- [x] `lib/readability.test.ts` (12 tests):
  - Extract clean content (mock fetch)
  - Extract OpenGraph metadata
  - Fallback to meta tags
  - Extract plain text
  - Handle timeout
  - Handle network errors
  - Handle 404/500
  - Follow redirects
- [x] `lib/auth.test.ts` (15 tests):
  - Generate tokens
  - Set expiration correctly
  - Claim valid tokens
  - Reject expired tokens
  - Reject non-existent tokens
  - Create user on claim
  - Cleanup expired tokens
- [x] `lib/llm.test.ts` (existing tests):
  - Claude provider initialization
  - Tag extraction with existing tags
  - Tag extraction returns valid format
  - Summarization returns three formats
  - Handle API errors gracefully

#### 7.3 Unit Tests - Database ✅
- [x] `db/schema.test.ts` (19 tests):
  - Migrations run successfully
  - Unique constraints enforced
  - Cascade deletes work
  - Default values set
  - Foreign keys enforced
  - Indexes created
  - Tag names lowercase

#### 7.3.5 Unit Tests - Services ✅
- [x] `services/articles.service.test.ts` (13 tests):
  - Get articles with tags
  - Filter by archived status
  - Filter by tag
  - Mark as read
  - Toggle archive
- [x] `services/tags.service.test.ts` (19 tests):
  - Get user tags
  - Get or create tag (case-insensitive)
  - Delete tag
- [x] `services/content.service.test.ts` (9 tests):
  - Search cached article IDs
  - Case-insensitive search
  - User isolation

#### 7.4 Integration Tests - Workers
- [ ] `workers/process-metadata.test.ts`:
  - Full processing pipeline (with mocks)
  - Status transitions
  - Cache file created
  - Metadata extracted and saved
  - Tags generated and associated
  - Reuse existing tags
  - Create new tags
  - Handle network errors
  - Handle Readability failures
  - Handle LLM errors
  - Increment attempts on failure
  - Rollback on error
  - Timeout after 60 seconds
- [ ] `workers/retry.test.ts`:
  - Detect stuck articles
  - Retry pending/processing/failed
  - Skip recent articles
  - Skip completed articles
  - Mark as error after max attempts
  - Log results

#### 7.5 Integration Tests - Routes
- [ ] `routes/articles.test.tsx`:
  - GET / - login when not authenticated
  - GET / - articles when authenticated
  - GET /articles - filter by status
  - GET /articles - filter by tag
  - GET /articles/:id - render reader
  - GET /articles/:id - 404 for non-existent
  - GET /articles/:id - 403 for other user's article
  - HTMX request detection
  - Full page vs partial rendering
- [ ] `routes/api.test.tsx`:
  - POST /articles/:id/read - mark as read
  - POST /articles/:id/archive - toggle archive
  - POST /articles/:id/summarize - generate summaries
  - POST /articles/:id/summarize - return cached
  - Auth required for all endpoints
- [ ] `routes/auth.test.tsx`:
  - POST /auth/telegram - create token
  - GET /auth/check/:token - pending status
  - GET /auth/check/:token - success status
  - GET /auth/check/:token - expired status
  - POST /auth/logout - clear session

#### 7.6 End-to-End Tests
- [ ] `test/e2e/article-capture.test.ts`:
  - Full flow: Telegram message → worker → database → cache
  - Verify all steps complete successfully
  - Verify tags associated
  - Verify reactions updated
- [ ] `test/e2e/auth-flow.test.ts`:
  - Full flow: Request token → Telegram login → poll → session
  - Verify user created on claim
  - Verify session set correctly
- [ ] `test/e2e/reading.test.ts`:
  - Full flow: Load article → read → summarize → mark as read
  - Verify cache serving
  - Verify summary caching
  - Verify readAt timestamp

#### 7.7 Test Coverage
- [ ] Run coverage report: `bun test --coverage`
- [ ] Review coverage gaps
- [ ] Add tests for uncovered critical paths
- [ ] Target: >80% overall, >90% for critical paths

**Deliverable**: Comprehensive test suite with high coverage.

**Testing**:
- Run all tests: `bun test`
- Check coverage: `bun test --coverage`
- Fix any failing tests

---

## Phase 8: Deployment

**Goal**: Deploy to Railway with CI/CD pipeline.

### Tasks

#### 8.1 Dockerfile
- [ ] Create `Dockerfile`:
  - FROM oven/bun:1
  - Create non-root user (UID from env)
  - Copy package files, install dependencies
  - Copy source code
  - Run copy-assets script
  - Create data and cache directories
  - Set ownership to non-root user
  - Switch to non-root user
  - Expose port 3000
  - CMD: bun run src/main.ts
- [ ] Create `.dockerignore`:
  - node_modules
  - .env
  - data/
  - cache/
  - coverage/
  - .git

#### 8.2 Railway Configuration
- [ ] Create Railway project from GitHub repo
- [ ] Configure environment variables in Railway:
  - TELEGRAM_BOT_TOKEN
  - BOT_USERNAME
  - LLM_PROVIDER=claude
  - LLM_API_KEY
  - SESSION_SECRET (generate: `openssl rand -base64 32`)
  - DATABASE_URL=/app/data/app.db
  - CACHE_DIR=/app/data/cache/articles
  - NODE_ENV=production
  - SESSION_MAX_AGE_DAYS=180
  - UID=1000
- [ ] Add persistent volume:
  - Mount point: /app/data
  - Size: 5GB (adjust as needed)
- [ ] Configure health check endpoint: /health

#### 8.3 GitHub Actions CI/CD
- [ ] Create `.github/workflows/deploy.yml`:
  - Trigger: push to main, PRs
  - Jobs:
    - test: Run tests and coverage
    - deploy: Deploy to Railway (main branch only)
  - Steps for test job:
    - Checkout code
    - Setup Bun
    - Install dependencies
    - Copy assets
    - Run tests
    - Generate coverage
    - Upload coverage artifact
  - Steps for deploy job:
    - Checkout code
    - Install Railway CLI
    - Deploy: railway up
- [ ] Add GitHub secret: RAILWAY_TOKEN
- [ ] Test workflow with PR

#### 8.4 Production Environment Setup
- [ ] Generate SESSION_SECRET: `openssl rand -base64 32`
- [ ] Create Telegram bot via BotFather
- [ ] Get bot token and username
- [ ] Get Claude API key from Anthropic
- [ ] Set all environment variables in Railway
- [ ] Verify volume mounted correctly

#### 8.5 Deployment Scripts
- [ ] Create `scripts/migrate.ts`:
  - Run database migrations
  - Can be run separately if needed
- [ ] Update package.json scripts:
  - `dev`: bun --watch src/main.ts
  - `start`: bun run src/main.ts
  - `test`: bun test
  - `test:watch`: bun test --watch
  - `test:coverage`: bun test --coverage
  - `migrate`: bun run scripts/migrate.ts
  - `copy-assets`: bun run scripts/copy-assets.ts

#### 8.6 Documentation
- [ ] Create README.md:
  - Project overview
  - Features list
  - Tech stack
  - **LLM Provider Setup** section:
    - Explain that operators choose their provider
    - List install commands for each: Claude, OpenAI, Gemini, local
    - Example: "For Claude: `bun add @anthropic-ai/sdk`"
    - Note about setting LLM_PROVIDER and LLM_API_KEY in .env
  - Local development setup
  - Environment variables
  - Deployment instructions
  - License
- [ ] Update .env.example with all variables (including LLM_PROVIDER options)
- [ ] Create CONTRIBUTING.md (if open source)

#### 8.7 First Deployment
- [ ] Push to main branch
- [ ] Watch GitHub Actions workflow
- [ ] Verify deployment in Railway
- [ ] Check logs for startup errors
- [ ] Test health endpoint: curl https://app.railway.app/health
- [ ] Test Telegram bot: /start command
- [ ] Test full flow: Send article URL

#### 8.8 Post-Deployment Verification
- [ ] Test authentication flow end-to-end
- [ ] Test article capture and processing
- [ ] Test article reading
- [ ] Test summaries generation
- [ ] Test archive functionality
- [ ] Test search
- [ ] Monitor logs for errors
- [ ] Check database file size
- [ ] Check cache directory
- [ ] Verify cron jobs running

**Deliverable**: Production deployment on Railway with CI/CD pipeline.

**Testing**:
- Build Docker image locally: `docker build -t lateread .`
- Run locally: `docker run -p 3000:3000 --env-file .env lateread`
- Test Railway deployment in staging environment
- Run full manual test checklist (from design doc)

---

## Implementation Order Summary

```
Phase 0: Foundation (1-2 days)
  → Project setup, config, database schema

Phase 1: Authentication (2-3 days)
  → Complete Telegram auth flow, session management

Phase 2: Article Capture (3-4 days)
  → Telegram bot handlers, workers, content extraction, basic tagging

Phase 3: Article Reading (2-3 days)
  → Web UI, article list, reader view, basic interactions

Phase 4: AI Features (2-3 days)
  → Tag refinement, summary generation, UI integration

Phase 5: Additional Features (2-3 days)
  → Archive, search, TTS, PWA manifest

Phase 6: Background Jobs (1-2 days)
  → Cron setup, retry mechanism, cleanup jobs

Phase 7: Testing (3-4 days)
  → Unit tests, integration tests, E2E tests, coverage

Phase 8: Deployment (1-2 days)
  → Docker, Railway, CI/CD, documentation

Total: ~17-26 days (3-5 weeks)
```

---

## Development Tips

### Daily Workflow
1. Check off completed tasks in this document
2. Run tests frequently: `bun test --watch`
3. Test manually in browser after each vertical slice
4. Commit working code at end of each task
5. Push to feature branch, create PR when phase complete

### Debugging
- Use `console.log()` liberally during development
- Check Railway logs: `railway logs` or in dashboard
- Test workers in isolation before integrating
- Use in-memory database for fast test iteration

### Code Quality
- Run biome for linting (if added)
- Keep functions small and focused
- Write comments for complex logic
- Follow TypeScript strict mode
- Keep components pure (no side effects)

### Testing Strategy
- Write tests alongside implementation
- Use TDD for critical paths (auth, workers)
- Mock external APIs (Telegram, Claude)
- Use fixtures for consistent test data
- Aim for >80% coverage overall

---

## Next Steps

1. Review this implementation plan
2. Set up local development environment
3. Start with Phase 0: Foundation
4. Work through phases sequentially
5. Test each phase thoroughly before moving to next
6. Update this document as you progress (check off tasks)
7. Ask questions when clarification needed

---

## Questions & Clarifications

**If you encounter:**
- Ambiguous requirements → Refer to DESIGN.md
- Technical blockers → Ask for guidance
- Missing details → Make reasonable assumptions, document them
- Better approaches → Propose alternative, discuss trade-offs

**Remember:**
- Vertical slices mean each phase delivers working features
- Test as you build, don't save testing for the end
- Keep it simple - avoid over-engineering
- The design doc is the source of truth

---

## Future Improvements: Error Handling Refactor

**Goal**: Standardize error handling across all routes for consistency and maintainability.

### Current State
Routes currently handle errors inconsistently:
- Mix of try-catch blocks with manual error checking
- Inconsistent error response formats (some JSON, some HTML)
- Error messages parsed from thrown Error strings
- Duplicate error handling logic across routes

### Proposed Improvements

#### 1. Custom Error Classes
Create typed error classes for common scenarios:
```typescript
// src/lib/errors.ts
export class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  // ...
}

export class ValidationError extends Error {
  statusCode = 400;
  // ...
}
```

#### 2. Error Handling Middleware
Centralize error response logic:
```typescript
// src/middleware/errorHandler.ts
export function errorHandler() {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      if (error instanceof NotFoundError) {
        return c.html(<ErrorPage message={error.message} />, 404);
      }
      if (error instanceof ValidationError) {
        return c.json({ error: error.message }, 400);
      }
      // ... handle other error types

      console.error("Unhandled error:", error);
      return c.html(<ErrorPage message="Internal server error" />, 500);
    }
  };
}
```

#### 3. Service Layer Updates
Services throw typed errors:
```typescript
// Before:
if (!article) throw new Error("Article not found");

// After:
if (!article) throw new NotFoundError("Article not found");
```

#### 4. Route Simplification
Routes become cleaner:
```typescript
// Before:
try {
  const article = await getArticleById(id, userId);
  // ...
} catch (error) {
  const msg = error instanceof Error ? error.message : "Unknown";
  if (msg === "Article not found") return c.html(..., 404);
  if (msg === "Access denied") return c.html(..., 403);
  return c.html(..., 500);
}

// After:
const article = await getArticleById(id, userId);
// Error middleware handles all errors automatically
```

#### 5. Consistent Error Components
Create reusable error display components:
- `ErrorPage`: For page routes (with Layout)
- `ErrorMessage`: For API routes (JSON)
- `ErrorPartial`: For HTMX partial updates

### Benefits
- **DRY**: No duplicate error handling logic
- **Type-safe**: TypeScript catches error handling mistakes
- **Consistent**: Same error format across all routes
- **Maintainable**: Change error handling in one place
- **Testable**: Easy to mock and test error scenarios

### Implementation Tasks
- [ ] Create custom error classes (`src/lib/errors.ts`)
- [ ] Create error handling middleware
- [ ] Create error display components
- [ ] Update all services to throw typed errors
- [ ] Update all routes to use error middleware
- [ ] Remove try-catch blocks from routes
- [ ] Update tests for new error handling
- [ ] Document error handling patterns in CLAUDE.md

**Note**: This is a future improvement to be implemented after Phase 8 or when error handling becomes a pain point.

---

## Future Improvements: Logging Infrastructure

**Goal**: Implement structured logging for better debugging, monitoring, and observability.

### Current State (v1)
Console logging with prefixes:
- `[Bot]` - Bot message handlers
- `[Worker Spawner]` - Worker creation and lifecycle
- `[Worker {id}]` - Worker processing steps
- Basic error logging with `console.error()`
- No log levels or filtering
- No request correlation

### Proposed Improvements

#### 1. Structured Logging Library
Use `pino` or `winston` for structured logs:
```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Usage:
logger.info({ articleId, userId }, 'Article created');
logger.error({ error, articleId }, 'Worker processing failed');
```

#### 2. Log Levels
Implement DEBUG, INFO, WARN, ERROR levels:
- **DEBUG**: Detailed flow information (tag processing, cache operations)
- **INFO**: High-level operations (article created, processing complete)
- **WARN**: Recoverable errors (LLM fallbacks, retry attempts)
- **ERROR**: Failures requiring attention (worker crashes, DB errors)

#### 3. Request Correlation
Add correlation IDs to trace requests:
```typescript
const correlationId = crypto.randomUUID();
logger.info({ correlationId, url }, 'Starting article processing');
// Pass correlationId through bot → worker → database
```

#### 4. Performance Metrics
Add timing information:
```typescript
const start = performance.now();
const result = await llmProvider.extractTags(content);
const duration = performance.now() - start;
logger.info({ duration, tagCount: result.tags.length }, 'Tags extracted');
```

#### 5. Log Aggregation (Production)
Ship logs to external service:
- Datadog, Logtail, Papertrail, or Logflare
- Enable search, filtering, and alerting
- Retain logs beyond console output

#### 6. Log Sampling
Sample high-volume logs:
```typescript
// Only log every 10th article processed
if (Math.random() < 0.1) {
  logger.debug({ articleId }, 'Processing article');
}
```

### Benefits
- **Better Debugging**: Structured logs easier to search and filter
- **Performance Monitoring**: Track slow operations (LLM calls, content extraction)
- **Error Tracking**: Aggregate errors with context
- **Audit Trail**: Track user actions and system changes
- **Production Ready**: Proper logging infrastructure for deployment

### Implementation Tasks
- [ ] Install logging library (`pino` or `winston`)
- [ ] Create logger configuration (`src/lib/logger.ts`)
- [ ] Add correlation ID middleware for HTTP requests
- [ ] Replace `console.log()` with structured logging
- [ ] Add performance timing for critical operations
- [ ] Configure log levels per environment
- [ ] Set up log aggregation service (optional)
- [ ] Document logging patterns in CLAUDE.md

**Note**: This is a v2+ improvement. Current console logging is sufficient for v1 development.

---

## Testing Infrastructure Improvements (Future)

### Unified Mocking Strategy

**Current State**: Test files use various mocking approaches:
- Database mocking: `mock.module()` with test database injection
- Fetch mocking: `global.fetch = mock()` with per-test overrides
- Config mocking: `mock.module("../lib/config")` with test values
- Different cleanup patterns: `beforeEach`, `afterEach`, `afterAll`
- Different test cache directories: Some use relative paths, some use `/tmp`

**Recommended Improvements**:
1. **Centralized Mock Setup**:
   - Create `test/mocks/setup.ts` with reusable mock factories
   - Standardize database mocking pattern across all tests
   - Provide consistent fetch mock utilities
   - Single source of truth for test configuration

2. **Database Mocking**:
   - All tests should use `createTestDatabase()` from `test/setup.ts`
   - Standardize `mock.module("../lib/db")` pattern
   - Ensure consistent cleanup with `resetDatabase()`

3. **Fetch Mocking**:
   - Create `createFetchMock()` utility in test setup
   - Provide common response builders (success, error, timeout)
   - Standardize `@ts-expect-error` usage for type safety

4. **Cache Directory Handling**:
   - Always use `/tmp/${crypto.randomUUID()}` for test caches
   - Consistent cleanup with `afterEach` hooks
   - Prevent test pollution and file system conflicts

5. **Mock Lifecycle**:
   - Document when to use `beforeEach` vs `afterEach` vs `afterAll`
   - Standardize mock reset patterns
   - Clear guidelines for mock isolation between tests

**Implementation Priority**: Post-v1 (after core functionality complete)

**Benefits**:
- Reduced test boilerplate
- Consistent test patterns across codebase
- Easier to write new tests
- Better test isolation and reliability
- Clearer test setup and teardown

---

Good luck with the implementation!
