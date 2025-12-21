# Lateread - Technical Specification Document

## Executive Summary

A self-hosted, privacy-focused read-later application that allows users to save articles from Telegram, processes them for optimal reading experience, automatically tags content using AI, and provides a clean web interface for consumption. Built with modern web technologies emphasizing simplicity, performance, and ease of self-hosting.

### Key Features
- Save articles via Telegram bot
- Automatic content extraction and cleanup (Readability)
- AI-powered automatic tagging
- Clean reading interface with TTS support
- On-demand AI summarization (three formats)
- Progressive Web App (PWA) capable
- File-based content caching
- Bring-your-own LLM keys
- Open source, self-hostable

---

## Technology Stack

### Runtime & Core Framework
- **Bun**: JavaScript/TypeScript runtime and package manager
- **Hono**: Lightweight web framework for API and SSR
- **JSX**: Template rendering (Bun native, no build step)
- **TypeScript**: Type safety throughout

### Data Layer
- **Drizzle ORM**: Database abstraction layer
- **SQLite**: Primary database (with abstraction for future Postgres migration)
- **File System**: Content cache storage (`./cache/articles/`)

### Frontend
- **HTMX**: Client-side interactivity (self-hosted)
- **Pico CSS**: Base styling framework (self-hosted)
- **Vanilla JavaScript**: Custom interactions (TTS, etc.)
- **No build step required**

### External Services
- **Telegram Bot API**: Message capture via Grammy framework
- **LLM Providers**: Claude (default), OpenAI, Gemini, or local models
- **Readability.js**: Content extraction (Mozilla's library)
- **JSDOM**: HTML parsing for server-side Readability

### Background Processing
- **Bun Workers**: Background job processing
- **Croner**: Cron job scheduling

### Testing
- **Bun Test**: Native test runner (built-in, no dependencies)

### Deployment
- **Railway**: Hosting platform with persistent volume
- **Docker**: Optional containerization

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interfaces                         │
├─────────────────────────────────────────────────────────────┤
│  Telegram Client        │        Web Browser/PWA            │
│  - Forward URLs         │        - Browse articles          │
│  - Authentication       │        - Read content             │
│                         │        - Manage tags/archive      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
├─────────────────────────────────────────────────────────────┤
│  Grammy Bot          │  Hono Server      │  Bun Workers     │
│  - Receive messages  │  - SSR pages      │  - Process URLs  │
│  - Queue articles    │  - API endpoints  │  - Extract text  │
│  - Handle auth       │  - Serve cache    │  - Generate tags │
│  - Status updates    │  - HTMX routing   │  - Store content │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       Data Layer                             │
├─────────────────────────────────────────────────────────────┤
│  SQLite Database (Drizzle)     │  File System Cache         │
│  - Users                       │  - {articleId}.html        │
│  - Articles (metadata only)    │  - Age-based cleanup       │
│  - Tags                        │                            │
│  - Article-Tag relations       │                            │
│  - Auth tokens (OTP)           │                            │
│  - Summaries (cached)          │                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   External Services                          │
├─────────────────────────────────────────────────────────────┤
│  LLM Provider (Claude/OpenAI/Gemini/Local)                  │
│  - Tag extraction (fast, cheap model)                       │
│  - Content summarization (structured JSON output)           │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Simplicity First**: Minimal dependencies, no complex build processes
2. **Self-Hosting Friendly**: Single deployment, file-based storage, configurable via ENV
3. **Progressive Enhancement**: Works without JavaScript, enhanced with HTMX
4. **Privacy Preserving**: User data stays on their instance, bring-your-own keys
5. **Abstraction Where Needed**: Database layer abstracted for future migration
6. **Separation of Concerns**: Clear module boundaries, centralized coordination

---

## Data Model

### Schema Design

#### Users Table
Stores core user information. Authentication method-agnostic to support future ingestion methods (email, browser extension, etc.).

```typescript
User {
  id: uuid (primary key)
  createdAt: timestamp
}
```

**Notes:**
- LLM configuration stored in ENV variables (deployment-wide in v1)
- Future: Separate `UserLLMConfig` table for per-user LLM settings

---

#### TelegramUsers Table
Links users to their Telegram accounts. Separated to allow multiple authentication methods.

```typescript
TelegramUser {
  id: uuid (primary key)
  userId: uuid (foreign key → User.id, unique)
  telegramId: string (unique, indexed)
  telegramUsername: string
  createdAt: timestamp
}
```

**Indexes:**
- `userId` (unique - one Telegram account per user)
- `telegramId` (unique - one user per Telegram account)

**Notes:**
- Future authentication methods: `EmailUser`, `BrowserExtensionUser`, etc.
- All would reference the same `User` table

---

#### Articles Table
Stores article metadata. Content HTML stored separately in file system.

```typescript
Article {
  id: uuid (primary key)
  userId: uuid (foreign key → User.id)
  url: string (not null)
  
  // Metadata (extracted from OpenGraph + Readability)
  title: string (nullable)
  description: string (nullable)
  imageUrl: string (nullable)
  siteName: string (nullable)
  
  // Processing status
  status: enum (not null, default: 'pending')
    - 'pending': Just received, queued for processing
    - 'processing': Worker is currently processing
    - 'completed': Successfully processed
    - 'failed': Processing failed, will retry
    - 'error': Max retries exceeded, gave up
  
  processingAttempts: integer (not null, default: 0)
  lastError: string (nullable)
  
  // Timestamps
  createdAt: timestamp (not null)
  updatedAt: timestamp (not null)
  processedAt: timestamp (nullable)
  readAt: timestamp (nullable)
  
  // User actions
  archived: boolean (not null, default: false)
}
```

**Indexes:**
- `userId` (for user's article list)
- `status` (for retry queries)
- `updatedAt` (for stuck job detection)
- Composite: `(userId, status, archived)` (for filtered lists)

**Notes:**
- Clean HTML content stored in `./cache/articles/{articleId}.html`
- Text content extracted on-demand from cached HTML (for TTS, search)
- Summaries stored in separate `ArticleSummaries` table

---

#### ArticleSummaries Table
Stores AI-generated summaries in three formats. Separated for cleaner schema and easier updates.

```typescript
ArticleSummary {
  id: uuid (primary key)
  articleId: uuid (foreign key → Article.id, unique, on delete cascade)
  oneSentence: string (not null)
  oneParagraph: string (not null)
  long: string (not null, ~500 words)
  generatedAt: timestamp (not null)
}
```

**Indexes:**
- `articleId` (unique - one summary per article)

**Notes:**
- Generated on-demand when user requests summary
- Cached to avoid repeated LLM calls
- Can be regenerated if needed (future feature)

---

#### Tags Table
Stores unique tags per user. Tags can be auto-generated or manually created.

```typescript
Tag {
  id: uuid (primary key)
  userId: uuid (foreign key → User.id)
  name: string (not null, stored lowercase)
  autoGenerated: boolean (not null, default: true)
  createdAt: timestamp (not null)
}
```

**Indexes:**
- Composite unique: `(userId, name)` (prevent duplicate tag names per user)
- `userId` (for user's tag list)

**Notes:**
- Tag names stored in lowercase for case-insensitive matching
- Always normalize to lowercase before insert/search: `tag.toLowerCase()`
- Display name can be stored separately if case preservation needed (future)
- LLM encouraged to reuse existing tags when possible

---

#### ArticleTags Table
Many-to-many relationship between Articles and Tags.

```typescript
ArticleTag {
  articleId: uuid (foreign key → Article.id, on delete cascade)
  tagId: uuid (foreign key → Tag.id, on delete cascade)
  
  PRIMARY KEY (articleId, tagId)
}
```

**Indexes:**
- Composite primary key serves as index
- Additional index on `tagId` for reverse lookup

---

#### AuthTokens Table
Temporary OTP tokens for Telegram-based authentication.

```typescript
AuthToken {
  id: uuid (primary key)
  userId: uuid (foreign key → User.id, nullable)
    - null when created
    - set when user claims token via Telegram bot
  token: string (unique, indexed)
  expiresAt: timestamp (not null, indexed)
  createdAt: timestamp (not null)
}
```

**Indexes:**
- `token` (unique, for quick lookup)
- `expiresAt` (for cleanup queries)

**Notes:**
- Tokens expire after 5 minutes
- Cleaned up hourly via cron
- One-time use (deleted after successful auth or expiration)

---

### Database Abstraction

Use **Drizzle ORM** to abstract database layer:

```typescript
// db/schema.ts - Define schema once
export const users = sqliteTable('users', { ... });
export const articles = sqliteTable('articles', { ... });
// etc.

// Alternative for Postgres (future):
// export const users = pgTable('users', { ... });
```

**Migration Strategy:**
- Start with SQLite
- Use Drizzle's dialect-agnostic schema definitions
- When migrating to Postgres: change table definitions, re-run migrations
- Application code remains unchanged

---

## File System Structure

### Project Layout

```
lateread/
├── src/
│   ├── main.ts                     # Main entry point
│   ├── cron.ts                     # Centralized cron job registry
│   │
│   ├── bot/
│   │   ├── index.ts                # Grammy bot initialization
│   │   └── handlers.ts             # Message handlers, commands
│   │
│   ├── routes/
│   │   ├── articles.tsx            # Article list, detail, actions
│   │   ├── api.tsx                 # API endpoints (mark read, summarize, etc.)
│   │   └── auth.tsx                # Authentication flow
│   │
│   ├── components/
│   │   ├── Layout.tsx              # Page layout wrapper
│   │   ├── ArticleCard.tsx         # Article preview card
│   │   ├── ArticleList.tsx         # List of articles
│   │   ├── TagBadge.tsx            # Tag display component
│   │   └── ReaderView.tsx          # Article reading view
│   │
│   ├── workers/
│   │   └── process-metadata.ts     # Bun Worker for article processing
│   │
│   ├── lib/
│   │   ├── db.ts                   # Drizzle database connection
│   │   ├── content-cache.ts        # File cache management
│   │   ├── llm.ts                  # LLM abstraction interface
│   │   ├── auth.ts                 # Auth helpers and cleanup
│   │   └── readability.ts          # Readability wrapper
│   │
│   └── db/
│       ├── schema.ts               # Drizzle schema definitions
│       └── migrations/             # SQL migration files
│
├── test/
│   ├── setup.ts                    # Test environment setup
│   ├── fixtures.ts                 # Reusable test data
│   └── mocks/
│       └── llm.ts                  # Mock LLM provider
│
├── cache/
│   └── articles/                   # Cached HTML files
│       └── {uuid}.html
│
├── public/
│   ├── htmx.min.js                 # Self-hosted HTMX (from npm)
│   ├── pico.min.css                # Self-hosted Pico CSS (from npm)
│   ├── styles.css                  # Custom styles
│   ├── manifest.json               # PWA manifest
│   └── favicon.ico
│
├── scripts/
│   └── copy-assets.ts              # Copy npm packages to public/
│
├── package.json
├── tsconfig.json
├── bunfig.toml                     # Bun configuration
├── .env.example                    # Environment variables template
└── README.md
```

---

## Module Specifications

### 1. Main Entry Point (`src/main.ts`)

**Purpose**: Initialize and coordinate all application components.

**Responsibilities:**
- Load and validate configuration (via `lib/config.ts`)
- Initialize Hono web server
- Set up Grammy Telegram bot
- Register route handlers
- Start background workers
- Initialize cron jobs
- Start HTTP server

**Interface:**
```typescript
// No exports, runs as main entry
```

**Startup Sequence:**
1. Load and validate environment variables via config module
2. Initialize database connection (pass config values)
3. Run pending migrations
4. Set up Hono app with middleware
5. Register all routes
6. Initialize and start Telegram bot (pass config values)
7. Register cron jobs
8. Start HTTP server on configured port
9. Log startup success with URLs

**Configuration Usage:**
```typescript
import { config } from './lib/config';

// Pass config values to setup functions
setupBot(config.TELEGRAM_BOT_TOKEN, config.BOT_USERNAME);
startServer(config.PORT);
```

**Dependencies:**
- `./lib/config` (must be imported first)
- `./bot`
- `./routes/*`
- `./cron`
- `./lib/db`

---

### 2. Cron Job Registry (`src/cron.ts`)

**Purpose**: Centralized registration and management of all scheduled tasks.

**Responsibilities:**
- Define all cron schedules
- Call module functions at scheduled times
- Log execution of scheduled tasks

**Interface:**
```typescript
export function startCrons(): void
```

**Scheduled Jobs:**

1. **Retry Failed Articles** (`*/5 * * * *` - every 5 minutes)
   - Calls `retryFailedArticles()` from `workers/retry`
   - Retries stuck/failed article processing
   
2. **Cache Cleanup** (`0 3 * * *` - daily at 3am)
   - Calls `cleanupOldCache()` from `lib/content-cache`
   - Deletes cached HTML files older than 30 days
   
3. **Auth Token Cleanup** (`0 * * * *` - hourly)
   - Calls `cleanupExpiredTokens()` from `lib/auth`
   - Removes expired authentication tokens

**Dependencies:**
- `croner`
- `./workers/retry`
- `./lib/content-cache`
- `./lib/auth`

---

### 3. Telegram Bot (`src/bot/`)

#### 3.1 Bot Initialization (`bot/index.ts`)

**Purpose**: Configure and initialize Grammy bot instance.

**Responsibilities:**
- Create Grammy bot with token from config
- Configure bot settings
- Use polling mode (not webhooks)
- Register command handlers
- Export bot instance for use in main entry

**Interface:**
```typescript
export function setupBot(token: string, username: string): void
export const bot: Bot // Grammy bot instance
```

**Configuration:**
- Bot created with `token` parameter (from config)
- Username stored for deep link generation
- **Polling mode only** - no webhook support
- Long polling for receiving updates

**Usage:**
```typescript
// In main.ts
import { config } from './lib/config';
import { setupBot } from './bot';

setupBot(config.TELEGRAM_BOT_TOKEN, config.BOT_USERNAME);
```

**Dependencies:**
- `grammy`
- `./handlers`

---

#### 3.2 Bot Handlers (`bot/handlers.ts`)

**Purpose**: Handle all Telegram bot interactions.

**Message Handlers:**

1. **`/start` Command**
   - Handle initial bot interaction
   - Welcome message for new users
   - Explain how to use the bot
   
2. **`/login {code}` Command**
   - Extract OTP code from command
   - Validate code exists and not expired
   - Create User record (if doesn't exist)
   - Create TelegramUser record linking to User
   - Associate auth token with user ID
   - Reply: "✅ Login successful! You can now return to the app."
   
3. **Message with URL**
   - Check if user exists in database (has User + TelegramUser records)
   - If user not found: reply "❌ Please log in first at https://lateread.app" and return
   - Extract URLs from message text
   - **Handle forwarded messages** (extract from forwarded content)
   - **Process only the first URL** if multiple URLs found
   - Ignore subsequent URLs (implementation simplification)
   - Create article record in database with `status: 'pending'`
   - React with 👀 emoji (processing started)
   - Spawn Bun Worker to process article
   - Update reaction to 👍 (success) or 👎 (failure)

**Interface:**
```typescript
export function registerHandlers(bot: Bot): void
```

**URL Extraction Logic:**
- Parse message text for URLs
- **Support forwarded messages** (check `forward_from` or forwarded content)
- Handle messages with URLs in text
- **Process only the first URL** if multiple found (implementation simplification)
- Validate URL format (basic http/https check)

**Unknown User Handling:**
- Query database for TelegramUser by telegramId
- If not found: send error message and refuse to save article
- Error message includes link to web app for authentication

**Worker Spawning:**
- Non-blocking (fire and forget with promise handling)
- Pass article ID to worker
- Handle worker errors gracefully
- Update Telegram reactions based on outcome

**Dependencies:**
- `grammy`
- `../lib/db`
- `../workers/process-metadata`
- `../lib/auth`

---

### 4. Routes (`src/routes/`)

#### 4.1 Article Routes (`routes/articles.tsx`)

**Purpose**: Server-side rendering and navigation for article browsing and reading.

**HTMX Pattern**: Option 6 (Hybrid approach)
- Detect `hx-request` header (lowercase)
- Return full page layout for direct navigation
- Return partial content for HTMX requests

**Routes:**

1. **`GET /`**
   - Check if user is authenticated (session cookie)
   - If not authenticated: render login page with "Login with Telegram" button
   - If authenticated: render articles list (same as `/articles?status=unread`)
   - No redirect, direct rendering for better UX

2. **`GET /articles`**
   - Query params: `status` (unread|archived), `tag` (filter by tag name)
   - Fetch articles from database with filters
   - Render article list with cards
   - Support for `hx-boost` navigation

3. **`GET /articles/:id`**
   - Load article metadata from database
   - Try to load cached HTML from file system
   - If not cached: fetch URL, process with Readability, cache result
   - Render reading view with clean content
   - Include TTS controls, summarize button
   - Auto-mark as read on scroll (HTMX intersect trigger)

**Helper Functions:**
```typescript
function isHtmxRequest(context): boolean {
  return context.req.header('hx-request') === 'true';
}
function renderPage(context, title: string, content: JSX.Element): Response
```

**Dependencies:**
- `hono`
- `../components/*`
- `../lib/db`
- `../lib/content-cache`
- `../lib/readability`

---

#### 4.2 API Routes (`routes/api.tsx`)

**Purpose**: Handle HTMX actions and API endpoints.

**Routes:**

1. **`POST /articles/:id/read`**
   - Mark article as read (set `readAt` timestamp)
   - Return updated article card or empty response
   - HTMX swap target: `outerHTML` or `none`

2. **`POST /articles/:id/archive`**
   - Toggle article archived status
   - Return updated article card or redirect

3. **`POST /articles/:id/summarize`**
   - Check if summary already exists in `article_summaries` table
   - If exists: return cached summaries as HTML
   - If not: 
     - Extract text from cached HTML
     - Call LLM provider to generate three summary formats
     - Store in `article_summaries` table
     - Return HTML fragment with summaries
   - Return all three formats: one sentence, one paragraph, long (~500 words)

4. **`GET /articles/search`**
   - Query param: `q` (search query)
   - Search article titles and descriptions (Phase 1)
   - Return filtered article list (HTMX target swap)
   - **Future (Phase 2)**: 
     - Add SQLite FTS5 virtual table
     - Include summaries in search
     - Full-text search across title, description, summaries

**Response Formats:**
- HTML fragments for HTMX swaps
- JSON for explicit API calls
- Appropriate HTMX headers (`HX-Trigger`, etc.)

**Dependencies:**
- `hono`
- `../lib/db`
- `../lib/content-cache`
- `../lib/llm`

---

#### 4.3 Authentication Routes (`routes/auth.tsx`)

**Purpose**: Handle Telegram-based authentication flow.

**Routes:**

1. **`GET /` (when not authenticated)**
   - Render login page with "Login with Telegram" button

2. **`POST /auth/telegram`**
   - Generate unique OTP token (UUID)
   - Store in `auth_tokens` table with 5-minute expiration
   - **Note**: User NOT created yet (created on successful claim)
   - Return JSON with token and Telegram deep link
   - Client opens: `https://t.me/YourBot?start={token}`

3. **`GET /auth/check/:token`**
   - Poll endpoint for client to check token status
   - Check if token exists and not expired
   - If expired: return `{ status: 'expired' }` and client shows login button again with error
   - If invalid: return `{ status: 'invalid' }`
   - If pending: return `{ status: 'pending' }`
   - If success: create session cookie, return `{ status: 'success', userId: '...' }`

4. **`POST /auth/logout`**
   - Clear session cookie
   - Redirect to home page

**Authentication Flow:**
```
1. User clicks "Login with Telegram" on landing page
2. Client makes AJAX POST to /auth/telegram
3. Server generates OTP token (no user created yet)
4. Client receives deep link: https://t.me/YourBot?start={token}
5. Client opens Telegram (bot receives /login {token})
6. Bot validates token, creates User + TelegramUser records
7. Client polls /auth/check/{token} every 2 seconds
8. Server returns success, sets session cookie
9. Client redirects to / (shows articles)
```

**Session Management:**
- Use Hono's cookie/session middleware
- Signed cookies with secret from config
- 180-day expiration (configurable via `SESSION_MAX_AGE_DAYS`)

**Dependencies:**
- `hono`
- `../lib/db`
- `../lib/auth`
- `../lib/config`

---

### 5. Components (`src/components/`)

All components are JSX functions returning renderable content.

#### 5.1 Layout (`components/Layout.tsx`)

**Purpose**: Main page layout wrapper with header, footer, and common assets.

**Interface:**
```typescript
export function Layout(props: { 
  title: string; 
  children: JSX.Element 
}): JSX.Element
```

**Structure:**
- HTML document wrapper
- `<head>` with meta tags, title, CSS, HTMX script
- `<header>` with navigation (Home, Unread, Archive, Settings)
- `<main>` with children content
- `<footer>` with app info

**Navigation:**
- All links use `hx-boost="true"` for HTMX navigation
- Active link highlighting based on current path

---

#### 5.2 ArticleCard (`components/ArticleCard.tsx`)

**Purpose**: Display article preview in list view.

**Interface:**
```typescript
export function ArticleCard(props: { 
  article: Article 
}): JSX.Element
```

**Structure:**
- Article thumbnail image (if available)
- Title and description
- Site name metadata
- Tag badges (clickable filters)
- Actions: "Read" link, "Mark as Read" button
- HTMX attributes for interactions

**HTMX Interactions:**
- "Read" button: `hx-boost` navigation
- "Mark as Read": `hx-post` with `hx-swap="outerHTML"` to remove card

---

#### 5.3 ArticleList (`components/ArticleList.tsx`)

**Purpose**: Render grid/list of article cards.

**Interface:**
```typescript
export function ArticleList(props: { 
  articles: Article[] 
}): JSX.Element
```

**Features:**
- Empty state when no articles
- Responsive grid layout
- Infinite scroll support (future enhancement)

---

#### 5.4 TagBadge (`components/TagBadge.tsx`)

**Purpose**: Clickable tag badge for filtering.

**Interface:**
```typescript
export function TagBadge(props: { 
  tag: Tag;
  href?: string; // Optional filter URL
}): JSX.Element
```

**Behavior:**
- Click navigates to `/articles?tag={name}`
- Uses `hx-boost` for smooth navigation

---

#### 5.5 ReaderView (`components/ReaderView.tsx`)

**Purpose**: Display full article reading interface.

**Interface:**
```typescript
export function ReaderView(props: { 
  article: Article;
  content: string; // Clean HTML
}): JSX.Element
```

**Structure:**
- Article header (title, metadata, original link)
- Summary section (at top, before content):
  - "Summarize" button (HTMX)
  - Summary display area (initially hidden)
  - Three summary formats when loaded
- Clean content area (rendered HTML)
- Footer with actions:
  - TTS play button (vanilla JS)
- Hidden HTMX trigger for auto-mark-as-read on scroll

**Summary Section:**
```tsx
<div class="summary-section">
  <button 
    hx-post="/articles/{id}/summarize"
    hx-target="#summaries"
    hx-swap="innerHTML">
    📝 Summarize Article
  </button>
  
  <div id="summaries">
    {/* Summaries load here via HTMX */}
  </div>
</div>
```

**Vanilla JS Integration:**
- TTS button uses Web Speech API (v1)
- Script tag inline in component
- Simple play/pause/stop controls
- Design allows for easy replacement with API-based TTS (future)

**Note:** Summary is loaded on-demand to avoid unnecessary LLM calls.

---

### 6. Workers (`src/workers/`)

#### 6.1 Article Processor (`workers/process-metadata.ts`)

**Purpose**: Background processing of articles in Bun Worker threads.

**Worker Implementation:**
- Uses Bun's modern Worker API (no imports needed)
- Receives `articleId` via `self.onmessage`
- Processes article through full pipeline
- Posts success/failure back via `self.postMessage`

**Worker Structure:**
```typescript
// workers/process-metadata.ts
self.onmessage = async (event) => {
  const { articleId } = event.data;
  
  try {
    // ... processing logic
    self.postMessage({ success: true, articleId });
  } catch (error) {
    self.postMessage({ 
      success: false, 
      articleId, 
      error: error.message 
    });
  }
};
```

**Spawning Worker:**
```typescript
const worker = new Worker('./workers/process-metadata.ts');
worker.postMessage({ articleId: '123' });

worker.onmessage = (event) => {
  const { success, articleId } = event.data;
  // Handle success/failure
};
```

**Processing Steps:**

1. **Fetch URL Content**
   - HTTP GET request to article URL
   - Handle redirects, timeouts
   - Error handling for network issues

2. **Extract Metadata**
   - Parse HTML with JSDOM
   - Extract OpenGraph tags (title, description, image, site_name)
   - Fallback to HTML meta tags if OG not available

3. **Run Readability**
   - Use Mozilla's Readability.js on parsed DOM
   - Extract clean article content (HTML)
   - Extract plain text version

4. **Generate Tags**
   - Load user's existing tags from database
   - Send content to LLM provider for tag extraction
   - LLM returns tags (reusing existing when possible)
   - Create new tags if LLM suggests novel ones

5. **Cache Content**
   - Write clean HTML to `./cache/articles/{articleId}.html`
   - Ensure directory exists

6. **Update Database**
   - Transaction to update article metadata
   - Insert/associate tags
   - Set status to `completed`
   - Set `processedAt` timestamp

**Error Handling:**
- Catch all errors
- Update article status to `failed`
- Store error message in `lastError`
- Increment `processingAttempts`
- Post error back to parent thread

**Interface:**
```typescript
export function processArticle(articleId: string): Promise<void>
```

**Dependencies:**
- Bun's native Worker API (no imports needed)
- `jsdom`
- `@mozilla/readability`
- `../lib/db`
- `../lib/llm`
- `../lib/content-cache`
- `../lib/config`

**Note:** Bun provides native Worker support without requiring `worker_threads` import.

---

#### 6.2 Retry Handler (`workers/retry.ts`)

**Purpose**: Find and retry stuck or failed articles.

**Function:**
```typescript
export async function retryFailedArticles(): Promise<void>
```

**Logic:**

1. **Query Stuck Articles**
   - Status is `pending`, `processing`, or `failed`
   - `updatedAt` is older than 5 minutes
   - `processingAttempts` < 3 (max retries)

2. **Retry Processing**
   - For each stuck article, spawn worker
   - Non-blocking (don't await)
   - Log retry attempts

3. **Mark Failed Articles**
   - Articles with `processingAttempts` >= 3
   - Update status to `error`
   - Set `lastError` to "Max retry attempts exceeded"

**Retry Strategy:**
- Max 3 attempts
- 5-minute cooldown between attempts
- Exponential backoff (future enhancement)

**Dependencies:**
- `../lib/db`
- `./process-metadata`

---

### 7. Library Modules (`src/lib/`)

#### 7.0 Configuration (`lib/config.ts`)

**Purpose**: Centralized, type-safe configuration using environment variables.

**Critical**: This module must be imported and validated before any other modules that depend on configuration.

**Exports:**
```typescript
export const config: {
  // Server
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  
  // Database
  DATABASE_URL: string;
  
  // Telegram
  TELEGRAM_BOT_TOKEN: string;
  BOT_USERNAME: string;
  
  // LLM
  LLM_PROVIDER: 'claude' | 'openai' | 'gemini' | 'local';
  LLM_API_KEY: string;
  
  // Auth
  SESSION_SECRET: string;
  SESSION_MAX_AGE_DAYS: number;
  
  // Cache
  CACHE_DIR: string;
  CACHE_MAX_AGE_DAYS: number;
  
  // Processing
  PROCESSING_TIMEOUT_SECONDS: number;
  MAX_RETRY_ATTEMPTS: number;
  RETRY_DELAY_MINUTES: number;
}
```

**Implementation:**
- Use Zod for validation and type inference
- Parse `process.env` when module is imported
- Throw descriptive errors for missing/invalid values
- Provide sensible defaults where appropriate
- Single source of truth for all configuration

**Usage Pattern:**
```typescript
// All modules import config, never use process.env directly
import { config } from './lib/config';

// Use config values
const db = createDatabase(config.DATABASE_URL);
setupBot(config.TELEGRAM_BOT_TOKEN, config.BOT_USERNAME);

// main.ts ensures config is loaded first
import { config } from './lib/config';  // First import!
import { setupBot } from './bot';
```

**Validation Schema:**
- Required fields throw error if missing
- Optional fields use defaults
- Type coercion for numbers (e.g., PORT from string to number)
- Enum validation for specific values (e.g., NODE_ENV, LLM_PROVIDER)

**Dependencies:**
- `zod`

**Note:** All other modules MUST import config instead of accessing `process.env` directly. This ensures type safety and validation.

---

#### 7.1 Database (`lib/db.ts`)

**Purpose**: Database connection and query interface.

**Exports:**
```typescript
export const db: DrizzleDatabase
export function runMigrations(): Promise<void>
```

**Responsibilities:**
- Create Drizzle connection to SQLite using `bun:sqlite`
- Export typed database instance
- Provide migration runner
- Enable WAL mode for better concurrency

**Configuration:**
- Import `config` and use `config.DATABASE_URL`
- Never access `process.env` directly
- Ensure data directory exists
- Enable WAL mode for SQLite

**Usage:**
```typescript
import { config } from './config';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

const sqlite = new Database(config.DATABASE_URL);
export const db = drizzle(sqlite);
```

**Dependencies:**
- `bun:sqlite` (Bun's native SQLite)
- `drizzle-orm/bun-sqlite`
- `../db/schema`
- `./config`

---

#### 7.2 Content Cache (`lib/content-cache.ts`)

**Purpose**: Manage file-based HTML content cache.

**Exports:**
```typescript
export class ContentCache {
  async get(articleId: string): Promise<string | null>
  async set(articleId: string, content: string): Promise<void>
  async delete(articleId: string): Promise<void>
  async exists(articleId: string): Promise<boolean>
}

export async function cleanupOldCache(): Promise<void>
```

**Cache Directory:**
- Import `config` and use `config.CACHE_DIR`
- File naming: `{uuid}.html`
- UTF-8 encoding

**Implementation:**
- Use `Bun.file()` for all file operations (not `node:fs`)
- Use `Bun.write()` for writing files
- Use `file.exists()` for existence checks
- Use `file.text()` for reading content

**Cleanup Logic:**
- Scan all files in cache directory
- Check file modification time
- Delete files older than `config.CACHE_MAX_AGE_DAYS` (default: 30)
- Log number of files deleted

**Error Handling:**
- Graceful handling of missing files
- Directory creation on-demand via `mkdir -p`
- Ignore permission errors (log warning)

**Dependencies:**
- Bun's native file I/O APIs
- `./config`

---

#### 7.3 LLM Abstraction (`lib/llm.ts`)

**Purpose**: Abstract interface for multiple LLM providers.

**Interface:**
```typescript
interface LLMProvider {
  extractTags(
    content: string, 
    existingTags: string[]
  ): Promise<{
    tags: string[];
    confidence: number;
  }>;
  
  summarize(content: string): Promise<{
    oneSentence: string;
    oneParagraph: string;
    long: string;
  }>;
}

export class ClaudeProvider implements LLMProvider
export class OpenAIProvider implements LLMProvider
export class GeminiProvider implements LLMProvider
export class LocalProvider implements LLMProvider

export function getLLMProvider(): Promise<LLMProvider>
```

**Provider Selection:**
- Read from config: `LLM_PROVIDER` (claude|openai|gemini|local)
- Dynamically import provider based on selection
- Throw error if required SDK not installed
- Return appropriate provider instance

**Tag Extraction Prompt Guidelines:**
- Use fast, cheap model (Claude Haiku, GPT-4o-mini, Gemini Flash)
- Provide existing tags for reuse (normalize to lowercase)
- Request JSON output with tags array and confidence score
- Limit to 5-10 tags per article
- Prefer existing tags when semantically similar

**Summary Prompt Guidelines:**
- Use higher quality model (Claude Sonnet, GPT-4o)
- Request structured JSON output with three summary lengths
- One sentence: < 30 words
- One paragraph: 3-5 sentences
- Long: ~500 words, detailed
- Preserve key facts and main arguments

**Error Handling:**
- Catch API errors
- Fallback to empty tags / generic error message
- Log errors with provider name
- Retry with backoff for rate limits

**Dependencies (Peer - Optional):**
- `@anthropic-ai/sdk` (Claude) - installed via: `bun add @anthropic-ai/sdk`
- `openai` (OpenAI) - installed via: `bun add openai`
- `@google/generative-ai` (Gemini) - installed via: `bun add @google/generative-ai`

**Note:** Only install the SDK for your chosen provider. The module uses dynamic imports and will throw a helpful error if the SDK is missing.

---

#### 7.4 Authentication (`lib/auth.ts`)

**Purpose**: Authentication token management and cleanup.

**Exports:**
```typescript
export async function cleanupExpiredTokens(): Promise<void>
export async function createAuthToken(): Promise<{
  token: string;
  telegramUrl: string;
}>
export async function claimAuthToken(
  token: string, 
  telegramId: string,
  telegramUsername: string
): Promise<User | null>
```

**Token Creation:**
- Generate UUID token
- Store in database with 5-minute expiration
- **Note**: User NOT created at this point
- Return token and formatted Telegram deep link

**Token Claiming:**
- Validate token exists and not expired
- Create User record
- Create TelegramUser record with telegramId and username
- Associate auth token with user ID
- Return user object

**Cleanup:**
- Delete all tokens where `expiresAt < NOW()`
- Run hourly via cron

**Dependencies:**
- `./db`

---

#### 7.5 Readability Wrapper (`lib/readability.ts`)

**Purpose**: Wrapper around Mozilla's Readability for server-side use.

**Exports:**
```typescript
export async function extractCleanContent(url: string): Promise<{
  title: string;
  content: string; // Clean HTML
  textContent: string; // Plain text
  excerpt: string;
  byline?: string;
  siteName?: string;
}>
```

**Process:**
1. Fetch URL (with timeout and user agent)
2. Parse HTML with JSDOM
3. Run Readability on parsed document
4. Extract metadata and clean content
5. Return structured result

**Error Handling:**
- Network errors (timeout, DNS, connection)
- Invalid HTML
- Readability failures (some pages can't be parsed)
- Return partial data or throw appropriate error

**Dependencies:**
- `jsdom`
- `@mozilla/readability`

---

### 8. Database Schema (`src/db/schema.ts`)

**Purpose**: Define all database tables using Drizzle schema.

**Pattern:**
```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  telegramId: text('telegram_id').notNull().unique(),
  telegramUsername: text('telegram_username').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ... other tables
```

**Schema Elements:**
- All tables defined with appropriate types
- Primary keys, foreign keys, unique constraints
- Default values for timestamps, UUIDs
- Indexes defined inline or separately
- Enums for status fields

**Exports:**
```typescript
export const users;
export const telegramUsers;
export const articles;
export const articleSummaries;
export const tags;
export const articleTags;
export const authTokens;
```

**Migration Generation:**
- Use `drizzle-kit` to generate SQL migrations
- Store in `src/db/migrations/`
- Run migrations on app startup

---

## Core Flows

### Flow 1: Article Capture (Telegram → Database)

**Trigger**: User forwards message containing URL to Telegram bot

**Steps:**

1. Grammy receives message via polling
2. Check if user exists in database (query TelegramUser by telegramId)
3. If user not found: send error message "❌ Please log in first at https://lateread.app" and exit
4. Extract URLs from message text (supports forwarded messages)
5. **Take only the first URL** if multiple URLs found (implementation simplification)
6. For the first URL:
   a. Create article record in database:
      - Generate UUID
      - Set `userId` from telegram user
      - Set `url` from extracted URL
      - Set `status = 'pending'`
      - Set `processingAttempts = 0`
      - Set timestamps
   b. React to message with 👀 emoji (processing started)
   c. Spawn Bun Worker with article ID (non-blocking)
   d. Worker completes → Update reaction to 👍
   e. Worker fails → Update reaction to 👎

**Error Handling:**
- Invalid URL format: Ignore or reply with error message
- User not authenticated: Reply with login prompt
- Database insert fails: Log error, don't react
- Worker spawn fails: React with 👎, mark article as failed

**Performance Considerations:**
- Non-blocking worker spawn
- Only process first URL (ignore others in message)
- Rate limiting on article creation (prevent spam)

---

### Flow 2: Article Processing (Worker)

**Trigger**: Worker receives article ID via message

**Steps:**

1. **Fetch Article**
   - Query database for article by ID
   - If not found or already completed: exit early

2. **Update Status**
   - Set `status = 'processing'`
   - Increment `processingAttempts`
   - Set `updatedAt = NOW()`

3. **Fetch URL Content**
   - HTTP GET with timeout (30 seconds)
   - Follow redirects (max 5)
   - User agent: Custom string identifying the app
   - Handle errors: network, timeout, 404, 500

4. **Parse HTML**
   - Create JSDOM instance from HTML string
   - Extract OpenGraph metadata:
     - `og:title` → title
     - `og:description` → description
     - `og:image` → imageUrl
     - `og:site_name` → siteName
   - Fallback to regular meta tags if OG not available

5. **Run Readability**
   - Create Readability instance with JSDOM document
   - Call `parse()` to extract article
   - Get clean HTML content
   - Get plain text content
   - Get excerpt

6. **Generate Tags**
   - Load user's existing tags from database
   - Extract text content (truncate to ~10k words for LLM)
   - Call LLM provider's `extractTags()` method
   - Pass existing tag names for reuse
   - LLM returns: `{ tags: string[], confidence: number }`
   - For each returned tag:
     - Check if tag exists in user's tags (case-insensitive match)
     - If exists: use existing tag ID
     - If new: create new tag, set `autoGenerated = true`

7. **Cache Content**
   - Write clean HTML to `./cache/articles/{articleId}.html`
   - Create directory if doesn't exist
   - UTF-8 encoding

8. **Update Database (Transaction)**
   - Update article record:
     - Set `title`, `description`, `imageUrl`, `siteName`
     - Set `status = 'completed'`
     - Set `processedAt = NOW()`
     - Set `updatedAt = NOW()`
   - Insert/update article-tag associations:
     - Delete existing associations (if retry)
     - Insert new associations for all tags
   - Commit transaction

9. **Notify Parent Thread**
   - Post success message with article ID
   - Parent updates Telegram reaction to 👍

**Error Handling at Each Step:**
- Catch all errors
- Update article status to `failed`
- Store error message in `lastError` field
- Set `updatedAt = NOW()`
- Don't increment `processingAttempts` again (already incremented in step 2)
- Post error message to parent thread
- Parent updates Telegram reaction to 👎

**Timeout:**
- Overall worker timeout: 60 seconds
- If exceeded: terminate worker, mark as failed

---

### Flow 3: Article Reading (User → PWA)

**Trigger**: User opens PWA and navigates to article

**Steps:**

1. **List View** (`GET /articles`)
   - Parse query params: `status`, `tag`
   - Query database for articles:
     - Filter by `userId` from session
     - Filter by `status` if provided
     - Filter by tag if provided (join with article_tags)
     - Order by `createdAt DESC`
     - Limit to 50 articles (pagination future)
   - Check if HTMX request (`HX-Request` header)
   - If HTMX: return ArticleList component
   - If not: return full Layout with ArticleList
   - Include tag filter UI (list of user's tags)

2. **Click "Read"** (HTMX boost to `/articles/:id`)
   - HTMX intercepts link click
   - Makes AJAX request to `/articles/:id`
   - Server receives request with `HX-Request` header

3. **Load Article** (`GET /articles/:id`)
   - Load article metadata from database by ID
   - Verify article belongs to current user
   - Try to load cached HTML:
     a. Check `./cache/articles/{id}.html` exists
     b. If exists: read file content
     c. If not exists: on-demand processing
   
4. **On-Demand Processing** (if cache miss)
   - Fetch URL content
   - Run Readability
   - Cache HTML to file system
   - Don't update database (metadata already exists)
   - Use cached result for response

5. **Render Response**
   - Check if HTMX request
   - If HTMX: return ReaderView component only
   - If not: return full Layout with ReaderView
   - Include:
     - Article header (title, metadata)
     - Clean HTML content (rendered)
     - TTS controls (vanilla JS inline)
     - Summarize button (HTMX)
     - Auto-mark-as-read trigger (HTMX intersect)

6. **Auto-Mark as Read**
   - HTMX intersect trigger at bottom of article
   - Fires once when user scrolls to end
   - `hx-post="/articles/:id/read"` with `hx-swap="none"`
   - Server updates `readAt` timestamp
   - No UI change needed

**TTS Interaction** (Client-Side)
- User clicks "🔊 Listen" button
- Vanilla JS extracts text from `.reader-content`
- Creates SpeechSynthesisUtterance
- Calls `speechSynthesis.speak()`
- Additional controls: pause, stop, speed (future)

**Summarize Interaction** (HTMX)
- User clicks "Summarize" button
- `hx-post="/articles/:id/summarize"`
- `hx-target="#summary"` (div below button)
- Server checks if summaries cached in database
- If cached: return HTML with summaries
- If not: generate via LLM, cache, return HTML
- HTMX swaps response into target div

---

### Flow 4: Retry Failed Articles (Cron)

**Trigger**: Cron job runs every 5 minutes

**Steps:**

1. **Query Stuck Articles**
   - Find articles where:
     - `status IN ('pending', 'processing', 'failed')`
     - `updatedAt < NOW() - 5 minutes`
     - `processingAttempts < 3`
   - Order by `updatedAt ASC` (oldest first)

2. **Retry Processing**
   - For each article:
     - Log retry attempt
     - Spawn Bun Worker with article ID
     - Don't await (fire and forget)
     - Worker handles incrementing attempts and updating status

3. **Mark Exhausted Articles**
   - Find articles where:
     - `status != 'completed'`
     - `processingAttempts >= 3`
   - Update:
     - `status = 'error'`
     - `lastError = 'Max retry attempts exceeded'`
     - `updatedAt = NOW()`

4. **Log Results**
   - Log number of articles retried
   - Log number of articles marked as error

**Performance:**
- Process in batches of 10 if queue is large
- Limit total retries per cron run to prevent overload

---

### Flow 5: Cache Cleanup (Cron)

**Trigger**: Cron job runs daily at 3am

**Steps:**

1. **Scan Cache Directory**
   - Read all files in `./cache/articles/`
   - For each file:
     - Get file stats (modification time)
     - Calculate age in days
     - If age > 30 days: add to deletion list

2. **Delete Old Files**
   - For each file in deletion list:
     - Delete file from file system
     - Log deletion (file name, age)
     - Ignore errors (file already deleted)

3. **Log Summary**
   - Total files scanned
   - Total files deleted
   - Total space freed (optional)

**Alternative Strategy** (Future Enhancement):
- Delete cache for archived articles older than 7 days
- Keep cache for unread articles indefinitely
- Requires database join during cleanup

---

### Flow 6: Authentication (OTP via Telegram)

**Trigger**: User clicks "Login with Telegram" on landing page

**Steps:**

1. **Request Token** (`POST /auth/telegram`)
   - Client makes AJAX request to server
   - Server generates UUID token
   - Server creates auth token record:
     - `token = UUID`
     - `userId = NULL` (not claimed yet)
     - `expiresAt = NOW() + 5 minutes`
   - **Note**: User record NOT created yet
   - Server returns JSON:
     ```json
     {
       "token": "abc-123",
       "telegramUrl": "https://t.me/YourBot?start=abc-123"
     }
     ```

2. **Display Deep Link**
   - Client renders "Open Telegram" button
   - Button href: `telegramUrl` from response
   - Also displays token for manual entry (fallback)

3. **User Opens Telegram**
   - Click opens Telegram app/web
   - Bot receives `/login abc-123` command

4. **Bot Processes Token**
   - Extract token from command
   - Query auth token from database
   - Validate:
     - Token exists
     - Token not expired
     - Token not already claimed
   - If invalid: reply with error message
   - **Create User record** (new!)
   - **Create TelegramUser record** with `telegramId` and `telegramUsername`
   - Update auth token: `userId = user.id`
   - Reply to user: "✅ Login successful! Return to the app."

5. **Client Polls for Success** (`GET /auth/check/:token`)
   - Client polls every 2 seconds
   - Server checks auth token:
     - If `userId IS NULL`: return `{ status: 'pending' }`
     - If `userId IS NOT NULL`: token claimed, user created!
   - Server creates session:
     - Set signed session cookie
     - 180-day expiration (configurable via `SESSION_MAX_AGE_DAYS`)
   - Return `{ status: 'success', userId: '...' }`

6. **Client Redirects**
   - On success response, stop polling
   - Redirect to `/` (home page shows articles)
   - User is now authenticated

**Security Considerations:**
- Tokens are single-use (delete after claim or expiration)
- Short expiration (5 minutes)
- Signed session cookies
- HTTPS required in production
- User created only on successful Telegram verification

---

## Testing Strategy

### Test Framework

**Bun Native Test Runner**
- Built-in test runner: `bun test`
- Jest-compatible API (`describe`, `it`, `expect`)
- Fast execution, parallel by default
- No additional dependencies needed
- Built-in mocking support

**Test File Structure:**
```
src/
  ├── lib/
  │   ├── content-cache.ts
  │   └── content-cache.test.ts
  ├── workers/
  │   ├── process-metadata.ts
  │   └── process-metadata.test.ts
  └── routes/
      ├── articles.tsx
      └── articles.test.tsx
```

**Running Tests:**
```bash
# Run all tests
bun test

# Run specific file
bun test src/lib/content-cache.test.ts

# Watch mode
bun test --watch

# Coverage (with --coverage flag)
bun test --coverage
```

---

### Unit Tests

#### 1. Content Cache Tests (`lib/content-cache.test.ts`)

**Purpose:** Verify file-based cache operations work correctly.

**What to test:**
- Save and retrieve HTML content successfully
- Return null for non-existent articles
- Handle special characters (unicode, emojis) in content
- Create cache directory automatically if missing
- Delete articles by ID
- Check article existence
- Cleanup deletes files older than threshold (30 days)
- Cleanup preserves recent files
- Handle empty cache directory gracefully

---

#### 2. Readability Wrapper Tests (`lib/readability.test.ts`)

**Purpose:** Verify content extraction from web pages.

**What to test:**
- Extract clean article content from valid HTML
- Extract OpenGraph metadata (title, description, image, site_name)
- Fallback to regular meta tags when OpenGraph missing
- Extract plain text from HTML
- Handle timeout errors (30 second limit)
- Handle network errors (DNS failures, connection refused)
- Handle non-article pages (404, 500 errors)
- Handle paywalled or restricted content gracefully
- Follow redirects up to maximum limit

**Note:** Mock `fetch()` globally to provide controlled test HTML responses.

---

#### 3. Authentication Tests (`lib/auth.test.ts`)

**Purpose:** Verify token-based authentication flow.

**What to test:**
- Generate valid UUID tokens
- Set expiration to 5 minutes from creation
- Return formatted Telegram deep link URL
- Claim valid unexpired tokens successfully
- Reject expired tokens
- Reject non-existent tokens
- Reject already-claimed tokens
- Create User and TelegramUser records on first claim
- Cleanup expired tokens from database
- Return count of deleted tokens

---

#### 4. Database Schema Tests (`db/schema.test.ts`)

**Purpose:** Verify database schema and constraints.

**What to test:**
- Run migrations successfully on fresh database
- Enforce unique constraints (telegramId, token, etc.)
- Cascade delete article_tags when article deleted
- Cascade delete article_tags when tag deleted
- Cascade delete article_summaries when article deleted
- Set default timestamps (createdAt, updatedAt)
- Set default UUIDs for id fields
- Enforce foreign key constraints
- Create indexes correctly
- Tag names stored in lowercase (case-insensitive)

**Note:** Use in-memory SQLite (`:memory:`) for fast test execution.

---

### Integration Tests

#### 5. Worker Processing Tests (`workers/process-metadata.test.ts`)

**Purpose:** Test full article processing pipeline.

**What to test:**
- Successfully process valid article URL end-to-end
- Update article status transitions: pending → processing → completed
- Create cache file with clean HTML content
- Extract and save metadata (title, description, image, site_name)
- Generate tags and store in database
- Create new tags when LLM suggests novel tags
- Reuse existing tags when LLM returns similar tag (case-insensitive)
- Associate tags with article via article_tags table
- Handle network errors by marking article as failed
- Handle Readability failures for non-article pages
- Handle LLM API errors gracefully (continue without tags)
- Increment processingAttempts counter on failure
- Rollback database transaction on any error
- Update Telegram message reactions (👀 → 👍 or 👎)
- Timeout worker after 60 seconds if processing hangs

**Setup:** Use test database, test cache directory, mock LLM provider, mock Telegram API.

---

#### 6. Retry Logic Tests (`workers/retry.test.ts`)

**Purpose:** Verify stuck article detection and retry mechanism.

**What to test:**
- Detect and retry articles in 'pending' status older than 5 minutes
- Detect and retry articles in 'processing' status older than 5 minutes (crashed workers)
- Detect and retry articles in 'failed' status older than 5 minutes
- Skip articles that already have 3 processing attempts
- Skip recently updated articles (less than 5 minutes old)
- Mark articles as 'error' status after exceeding max attempts (3)
- Do not retry articles with 'completed' status
- Do not retry articles with 'error' status
- Handle multiple stuck articles in single cron run
- Log retry attempts and results appropriately

---

#### 7. Route Tests (`routes/articles.test.tsx`)

**Purpose:** Test HTTP routes and HTMX behavior.

**What to test:**

**GET / (home):**
- Return login page when user not authenticated
- Return articles list when user authenticated
- Render full HTML page without HX-Request header
- Render partial content with HX-Request header

**GET /articles:**
- Return 200 status code
- Filter by status query parameter (unread, archived)
- Filter by tag query parameter
- Require authentication (show login if not authenticated)
- Only show articles belonging to current user
- Order articles by createdAt DESC
- Handle empty article list with appropriate message

**GET /articles/:id:**
- Return article reader view with clean content
- Load cached content from file system if available
- Process article on-demand if cache miss
- Return 404 for non-existent article ID
- Return 403 for articles belonging to other users
- Include TTS controls in rendered response
- Include summarize button

**POST /articles/:id/read:**
- Mark article as read (set readAt timestamp)
- Return success status (200)
- Require user authentication

**POST /articles/:id/summarize:**
- Return cached summaries if already generated
- Generate summaries via LLM if not cached
- Save summaries to article_summaries table
- Return HTML with all three summary formats
- Handle LLM API errors gracefully
- Require user authentication

**Note:** Use Hono's `testClient` helper for making test requests with proper headers and cookies.

---

### End-to-End Tests

#### 8. Full Flow Tests (`test/e2e/`)

**Purpose:** Test complete user journeys across multiple components.

**Test Scenarios:**

**Article Capture and Processing:**
1. Mock Telegram message with article URL
2. Trigger bot message handler
3. Verify article created in database with 'pending' status
4. Verify worker spawned successfully
5. Wait for processing to complete (poll status)
6. Verify cache file created in file system
7. Verify tags generated and associated
8. Verify article status updated to 'completed'
9. Verify Telegram reaction updated to 👍

**Authentication Flow:**
1. Request auth token via POST /auth/telegram
2. Verify token stored in database with null userId
3. Mock Telegram bot /login command with token
4. Verify User and TelegramUser records created
5. Verify token associated with user ID
6. Poll /auth/check/{token} endpoint
7. Verify success response received
8. Verify session cookie set correctly

**Reading and Summarization:**
1. Create test article in database (pre-processed)
2. Create cache file for article
3. Request article page (GET /articles/:id)
4. Verify clean content displayed
5. Request summary generation (POST /articles/:id/summarize)
6. Verify summary created in article_summaries table
7. Verify all three summary formats returned
8. Mark article as read (auto-trigger on scroll)
9. Verify readAt timestamp set

**Note:** Mock external APIs (Telegram, LLM) but use real database and file system operations.

---

### Test Utilities

**Test Fixtures (`test/fixtures.ts`):**
- Mock HTML content for Readability testing
- Database setup helper (in-memory SQLite)
- User creation helper
- Article creation helper with customizable fields
- Tag creation helper
- Auth token creation helper
- Wait/polling helper for async conditions
- Cleanup helpers for database and cache

**Mock Providers (`test/mocks/`):**
- Mock LLM provider with configurable responses
- Mock Telegram bot messages and commands
- Mock HTTP fetch responses

---

### Test Coverage Goals

**Target Coverage:**
- Critical paths (auth, article processing): > 90%
- Database and utilities: > 85%
- Routes and API: > 80%
- Overall project: > 80%

**Areas with lower coverage requirements:**
- JSX components (visual/manual testing)
- Cron scheduling (covered by integration tests)
- Development utilities

**Coverage Reporting:**
```bash
bun test --coverage
```

Coverage reports saved as GitHub Actions artifacts (no external service upload).

---

### Continuous Integration

**GitHub Actions Workflow:**
- Checkout code
- Setup Bun
- Install dependencies
- Run all tests
- Generate coverage report
- Upload coverage as artifact
- Fail build if tests fail

**No additional tools:**
- No CodeCov upload
- No Husky pre-commit hooks
- Simple, focused CI pipeline

---

### Manual Testing Checklist

**Telegram Bot:**
- [ ] Forward message with URL → receives 👀 reaction
- [ ] Processing completes → reaction changes to 👍
- [ ] Processing fails → reaction changes to 👎
- [ ] `/start` command → welcome message
- [ ] `/login {token}` → login success message
- [ ] Unknown user sends URL → receives "please log in" error
- [ ] Multiple URLs in message → only first URL processed
- [ ] Forwarded message with URL → processes correctly

**Authentication:**
- [ ] Click "Login with Telegram" → receive token
- [ ] Open Telegram deep link → bot confirms
- [ ] Poll status → eventually returns success
- [ ] Session cookie set → redirects to articles
- [ ] Logout → clears session
- [ ] Expired token → shows error message and login button again

**Article List:**
- [ ] View unread articles → displays correctly
- [ ] Filter by tag → shows only tagged articles
- [ ] Search articles → returns matches
- [ ] Click article card → navigates to reader
- [ ] Empty state when no articles
- [ ] HTMX boost navigation (no full page reload)

**Article Reading:**
- [ ] Article displays with clean formatting
- [ ] Images load correctly
- [ ] Tags display and are clickable
- [ ] "View Original" link opens source
- [ ] Scroll to bottom → auto-marks as read
- [ ] TTS button → begins reading article
- [ ] TTS pause/stop controls work
- [ ] Summarize button → generates summaries
- [ ] Summary displays in all three formats

**Background Processing:**
- [ ] New article processes within 1 minute
- [ ] Failed article retries after 5 minutes
- [ ] Article marked as error after 3 failures
- [ ] Cache cleanup removes old files
- [ ] Auth token cleanup removes expired tokens

**Edge Cases:**
- [ ] Invalid URL → handles gracefully
- [ ] Paywall article → partial content extracted
- [ ] Non-article page → fails gracefully
- [ ] Very long article → processes correctly
- [ ] Article with no images → displays without errors
- [ ] Article with special characters → handles correctly
- [ ] Concurrent article processing → no race conditions

---

## Environment Variables

**Required:**
```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
BOT_USERNAME=your_bot_name

# Database
DATABASE_URL=./data/app.db  # or /app/data/app.db in production

# LLM Provider (install only the SDK you need)
LLM_PROVIDER=claude  # claude | openai | gemini | local
LLM_API_KEY=sk-...   # API key for chosen provider

# Server
PORT=3000
NODE_ENV=production  # development | production | test

# Session (generate with: openssl rand -base64 32)
SESSION_SECRET=your-random-secret-here
SESSION_MAX_AGE_DAYS=180  # Default: 180 days (6 months)
```

**Optional:**
```bash
# Cache Settings
CACHE_DIR=./cache/articles  # or /app/data/cache/articles in production
CACHE_MAX_AGE_DAYS=30

# Processing Settings
PROCESSING_TIMEOUT_SECONDS=60
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_MINUTES=5

# LLM Model Selection (override defaults)
LLM_TAGGING_MODEL=claude-haiku-4.5
LLM_SUMMARY_MODEL=claude-sonnet-4.5

# Logging
LOG_LEVEL=info  # debug | info | warn | error

# Railway-specific
UID=1000  # Non-root user ID for Docker
```

**LLM Provider Setup:**

Only install the SDK for your chosen provider:

```bash
# For Claude (Anthropic)
bun add @anthropic-ai/sdk
# Set: LLM_PROVIDER=claude

# For OpenAI
bun add openai
# Set: LLM_PROVIDER=openai

# For Google Gemini
bun add @google/generative-ai
# Set: LLM_PROVIDER=gemini

# For local models (Ollama, etc.)
# No installation needed
# Set: LLM_PROVIDER=local
```

---

## Deployment

### Railway Configuration

**Project Setup:**
1. Create new Railway project from GitHub repository
2. Railway auto-detects Bun project
3. Configure environment variables in Railway dashboard
4. Add persistent volume for data

**Custom Dockerfile:**

```dockerfile
# Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Create non-root user
# Railway sets UID via environment variable
ARG UID=1000
ARG GID=1000
RUN groupadd -g ${GID} appuser && \
    useradd -u ${UID} -g ${GID} -m -s /bin/bash appuser

# Install dependencies as root
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Copy application source
COPY . .

# Copy public assets from npm packages
RUN bun run scripts/copy-assets.ts

# Create necessary directories and set ownership
RUN mkdir -p /app/data/cache/articles && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Start application
CMD ["bun", "run", "src/main.ts"]
```

**Railway Volume Configuration:**
1. Add volume in Railway dashboard
2. Mount point: `/app/data`
3. Used for:
   - SQLite database: `/app/data/app.db`
   - Cache directory: `/app/data/cache/articles/`

**Environment Variables (Railway):**
Set in Railway dashboard:
```bash
# Required
TELEGRAM_BOT_TOKEN=your_token_here
BOT_USERNAME=your_bot_username
LLM_PROVIDER=claude
LLM_API_KEY=your_llm_key_here
SESSION_SECRET=your_secret_here

# Paths (use volume mount)
DATABASE_URL=/app/data/app.db
CACHE_DIR=/app/data/cache/articles

# Optional (Railway provides PORT)
NODE_ENV=production
SESSION_MAX_AGE_DAYS=180
CACHE_MAX_AGE_DAYS=30

# Railway-specific
UID=1000  # Non-root user ID
```

**Port Configuration:**
- Railway automatically provides `PORT` environment variable
- App listens on `process.env.PORT || 3000`

**Health Checks:**
Add health endpoint:
```typescript
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))
```

---

### Deployment Scripts

**Asset Copy Script (`scripts/copy-assets.ts`):**
```typescript
#!/usr/bin/env bun

const PUBLIC_DIR = './public';

// Ensure public directory exists
await Bun.write(`${PUBLIC_DIR}/.gitkeep`, '');

// Copy HTMX
const htmx = Bun.file('./node_modules/htmx.org/dist/htmx.min.js');
await Bun.write(`${PUBLIC_DIR}/htmx.min.js`, htmx);

// Copy Pico CSS
const pico = Bun.file('./node_modules/@picocss/pico/css/pico.min.css');
await Bun.write(`${PUBLIC_DIR}/pico.min.css`, pico);

console.log('✅ Assets copied to public/');
```

**Note:** Deploy script can be added later if needed. For now, deployment happens via GitHub Actions.

---

### GitHub Actions Workflow

**CI/CD Pipeline (`.github/workflows/deploy.yml`):**

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      
      - name: Install dependencies
        run: bun install
      
      - name: Copy assets
        run: bun run scripts/copy-assets.ts
      
      - name: Run tests
        run: bun test
      
      - name: Generate coverage
        run: bun test --coverage
      
      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 30
  
  deploy:
    name: Deploy to Railway
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Install Railway CLI
        run: npm install -g @railway/cli
      
      - name: Deploy to Railway
        run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

**Required GitHub Secrets:**
- `RAILWAY_TOKEN`: Generate from Railway dashboard (Account Settings → Tokens)

**Railway CLI Reference:**
- Uses official Railway CLI: https://blog.railway.com/p/github-actions
- Simple `railway up` command deploys from current directory

---

### Production Checklist

**Before First Deployment:**
- [ ] Set all required environment variables in Railway
- [ ] Create Railway volume and configure mount point
- [ ] Generate strong SESSION_SECRET: `openssl rand -base64 32`
- [ ] Set up Telegram bot via BotFather
- [ ] Obtain LLM API key from provider
- [ ] Configure GitHub secrets (RAILWAY_TOKEN)
- [ ] Test deployment with `scripts/deploy.sh`

**Post-Deployment:**
- [ ] Verify health endpoint: `curl https://lateread.railway.app/health`
- [ ] Test Telegram bot responds to `/start`
- [ ] Test article capture flow end-to-end
- [ ] Monitor Railway logs for errors
- [ ] Set up Telegram webhook (optional): `https://lateread.railway.app/webhook`

**Monitoring:**
- Railway dashboard shows: CPU, memory, request metrics
- Application logs via: `railway logs`
- Database size monitoring (volume usage)
- Cache cleanup cron job logs

---

### Local Development

**Setup:**
```bash
# Clone repository
git clone https://github.com/yourusername/lateread
cd lateread

# Install dependencies
bun install

# Copy environment template
cp .env.example .env

# Edit .env with your values
vim .env

# Copy assets
bun run scripts/copy-assets.ts

# Run database migrations
bun run src/lib/db.ts  # Or separate migration script

# Start development server
bun run src/index.ts
```

**Development Scripts:**
```json
{
  "scripts": {
    "dev": "bun --watch src/main.ts",
    "start": "bun run src/main.ts",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "migrate": "drizzle-kit push:sqlite",
    "copy-assets": "bun run scripts/copy-assets.ts"
  }
}
```

---

## Future Enhancements

### Phase 2 Features
1. **Full-text search** using SQLite FTS5
2. **Reading statistics** (time spent, articles read per week)
3. **Export functionality** (Markdown, EPUB)
4. **Browser extension** for one-click saving
5. **Pocket/Instapaper import**

### Phase 3 Features
1. **Highlights and annotations**
2. **Social features** (share articles, recommendations)
3. **Collections/folders** (organize beyond tags)
4. **Email ingestion** (forward emails to read later)
5. **Podcast/video transcription** support

### Technical Improvements
1. **PostgreSQL migration** using Drizzle abstraction
2. **Redis caching** for frequently accessed data
3. **CDN integration** for cached content
4. **Horizontal scaling** with multiple workers
5. **Webhook mode** for Telegram bot
6. **Service worker** for offline PWA support
7. **Advanced LLM features** (question answering, semantic search)
8. **Multi-stage Docker build** to optimize production image:
   - Build stage: Install all dependencies (including dev deps like htmx, pico)
   - Copy assets stage: Run copy-assets.ts script
   - Production stage: Copy only runtime dependencies and assets
   - Reduces node_modules size in production (exclude TypeScript, drizzle-kit, htmx/pico sources)

---

## Success Criteria

### MVP Launch Requirements
- [ ] User can authenticate via Telegram
- [ ] User can save articles by forwarding to bot
- [ ] Articles process and extract clean content
- [ ] Articles auto-tag with AI
- [ ] User can browse and filter articles
- [ ] User can read articles in clean interface
- [ ] TTS works for article reading
- [ ] Summaries generate on demand
- [ ] Cache cleanup runs automatically
- [ ] Failed articles retry automatically
- [ ] Deployment on Railway is stable
- [ ] All critical tests passing (> 95% coverage)

### Performance Targets
- Article processing: < 30 seconds (p95)
- Page load time: < 2 seconds (p95)
- TTS start latency: < 1 second
- Summary generation: < 10 seconds
- Uptime: > 99% (excluding maintenance)

### User Experience Goals
- Zero-click article saving (just forward)
- Clean, distraction-free reading
- Fast navigation with HTMX
- Works on mobile and desktop
- No JavaScript required for core features (progressive enhancement)

---

## Appendix

### Technology Decision Rationale

**Why Bun?**
- Fast runtime, native TypeScript support
- Built-in SQLite and Worker threads
- Excellent DX, single binary deployment
- No build step needed for JSX
- Native test runner included

**Why HTMX?**
- Minimal JavaScript, progressively enhanced
- Server-side rendering, good for SEO
- Simple mental model, easy to debug
- Works without complex client state

**Why SQLite?**
- Perfect for single-server deployments
- Zero configuration, file-based
- Excellent read performance
- Easy backups (copy file)

**Why File-based Cache?**
- Simpler than blob storage
- Easy to inspect and debug
- No additional services needed
- Works great on Railway volumes

**Why LLM Abstraction?**
- Provider flexibility
- Cost optimization (different models for different tasks)
- Future-proof (new providers emerge)
- User choice (bring your own keys)

### Glossary

- **HTMX**: Hypermedia-driven frontend library
- **Grammy**: Telegram bot framework for TypeScript
- **Drizzle**: TypeScript ORM with excellent DX
- **Readability**: Mozilla's content extraction algorithm
- **PWA**: Progressive Web App
- **OTP**: One-Time Password
- **TTS**: Text-to-Speech
- **SSR**: Server-Side Rendering
- **Croner**: Cron job library for Node/Bun
- **Bun Test**: Bun's native test runner

---

## Document Metadata

**Version**: 1.0  
**Last Updated**: 2024-12-21  
**Status**: Final Specification  
**Author**: Architecture Team  
**Next Steps**: Task decomposition and implementation planning