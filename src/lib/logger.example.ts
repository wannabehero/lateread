/**
 * Usage examples for the logger module.
 * This file demonstrates best practices for structured logging.
 */

import type { Context } from "hono";
import type { AppContext } from "../types/context";
import { createLogger, getLogger, logger } from "./logger";

// Example 1: Simple info log
export function exampleInfoLog() {
  logger.info("User logged in", {
    userId: "user-123",
    method: "telegram",
    timestamp: Date.now(),
  });
}

// Example 2: Debug log with operation details
export function exampleDebugLog() {
  logger.debug("Cache operation completed", {
    operation: "hit",
    key: "article:abc-123",
    ttl: 3600,
    sizeBytes: 15420,
  });
}

// Example 3: Warning with potential error
export function exampleWarnLog(apiError: unknown) {
  logger.warn("API rate limit approaching", {
    remaining: 10,
    threshold: 100,
    endpoint: "/api/articles",
    error: apiError, // Error will be formatted automatically
  });
}

// Example 4: Error log with full error object
export function exampleErrorLog(err: unknown) {
  logger.error("Failed to process article", {
    articleId: "article-456",
    userId: "user-123",
    retryCount: 3,
    error: err, // Extracts stack, type, message
  });
}

// Example 5: Multiple metadata fields
export function exampleComplexLog() {
  logger.info("Article processing completed", {
    articleId: "abc-123",
    userId: "user-456",
    duration: 2500,
    tags: ["tech", "ai", "programming"],
    wordCount: 1500,
    success: true,
  });
}

// Example 6: Worker completion
export function exampleWorkerLog() {
  logger.info("Worker completed", {
    workerId: "worker-1",
    taskType: "article-processing",
    articlesProcessed: 5,
    duration: 12000,
  });
}

// Anti-patterns (what NOT to do):

// ❌ BAD: Template literals in message
function badExample1() {
  const userId = "123";
  logger.info(`User ${userId} logged in`); // Don't do this!
}

// ✅ GOOD: Static message with metadata
function goodExample1() {
  const userId = "123";
  logger.info("User logged in", { userId });
}

// ❌ BAD: Concatenating values in message
function badExample2() {
  const count = 5;
  logger.info("Processed " + count + " articles"); // Don't do this!
}

// ✅ GOOD: Static message with count in metadata
function goodExample2() {
  const count = 5;
  logger.info("Articles processed", { count });
}

// ❌ BAD: Including error details in message
function badExample3(error: Error) {
  logger.error(`Database error: ${error.message}`); // Don't do this!
}

// ✅ GOOD: Static message with error in metadata
function goodExample3(error: Error) {
  logger.error("Database operation failed", { error });
}

// ============================================
// Child Logger Examples
// ============================================

// Example 7: Creating child loggers with base context
export function exampleChildLogger() {
  const serviceLogger = createLogger({ service: "articles" });

  serviceLogger.info("Service started", { port: 3000 });
  // Output: { level: "info", message: "Service started", service: "articles", port: 3000, ... }

  const requestLogger = serviceLogger.child({ reqId: "req-123" });
  requestLogger.info("Processing request", { userId: "user-456" });
  // Output: { level: "info", message: "Processing request", service: "articles", reqId: "req-123", userId: "user-456", ... }
}

// Example 8: Using getLogger in route handlers
export function exampleRouteHandler(c: Context<AppContext>) {
  const log = getLogger(c);

  // reqId is automatically included from middleware
  log.info("Articles fetched", { count: 10, filter: "unread" });
  // Output: { level: "info", message: "Articles fetched", reqId: "abc-123", count: 10, filter: "unread", ... }

  return c.json({ success: true });
}

// Example 9: Passing logger to service functions
async function processArticle(
  articleId: string,
  log: ReturnType<typeof getLogger>,
) {
  log.info("Processing started", { articleId });

  try {
    // ... processing logic
    log.info("Processing completed", { articleId, duration: 1200 });
  } catch (error) {
    log.error("Processing failed", { articleId, error });
    throw error;
  }
}

export function exampleServiceWithLogger(c: Context<AppContext>) {
  const log = getLogger(c);
  const articleId = "article-123";

  // Pass logger to service function
  processArticle(articleId, log);
  // All logs will include reqId from the request context
}

// Example 10: Multiple child logger levels
export function exampleNestedChildLoggers() {
  const rootLogger = createLogger({ app: "lateread" });
  const serviceLogger = rootLogger.child({ service: "bot" });
  const chatLogger = serviceLogger.child({ chatId: "12345" });

  chatLogger.info("Message received", { text: "/start" });
  // Output: { level: "info", message: "Message received", app: "lateread", service: "bot", chatId: "12345", text: "/start", ... }
}

// Example 11: Creating operation-specific child loggers
export function exampleOperationLogger(c: Context<AppContext>) {
  const log = getLogger(c);

  // Create child logger for specific operation
  const tagLogger = log.child({ operation: "tag-extraction" });

  tagLogger.debug("Extracting tags", { articleId: "abc-123" });
  tagLogger.info("Tags extracted", {
    articleId: "abc-123",
    tags: ["tech", "ai"],
  });
  // Both include: reqId (from middleware) + operation (from child)
}

// ============================================
// Real-World Patterns
// ============================================

// Pattern 1: Structured error handling with context
export async function exampleErrorHandling(c: Context<AppContext>) {
  const log = getLogger(c);
  const articleId = c.req.param("id");

  try {
    log.info("Fetching article", { articleId });
    // ... fetch article
    log.info("Article fetched", { articleId });
  } catch (error) {
    log.error("Article fetch failed", { articleId, error });
    return c.json({ error: "Article not found" }, 404);
  }
}

// Pattern 2: Timing operations with context
export async function exampleTimingOperation(c: Context<AppContext>) {
  const log = getLogger(c);
  const startTime = Date.now();

  try {
    // ... do work
    const duration = Date.now() - startTime;
    log.info("Operation completed", { duration, success: true });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error("Operation failed", { duration, error });
    throw error;
  }
}
