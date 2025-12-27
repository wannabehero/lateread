/**
 * Usage examples for the logger module.
 * This file demonstrates best practices for structured logging.
 */

import { logger } from "./logger";

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
