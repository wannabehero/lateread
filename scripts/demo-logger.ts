#!/usr/bin/env bun

/**
 * Demo script to show logger output in different environments.
 * Run with:
 *   NODE_ENV=development bun scripts/demo-logger.ts
 *   NODE_ENV=production bun scripts/demo-logger.ts
 */

import { createLogger, logger } from "../src/lib/logger";

console.log(
  `\n=== Logger Demo (NODE_ENV=${process.env.NODE_ENV || "development"}) ===\n`,
);

console.log("--- Root Logger ---\n");

// Info log
logger.info("Application started", {
  version: "1.0.0",
  port: 3000,
  environment: process.env.NODE_ENV || "development",
});

// Debug log (will be filtered in production)
logger.debug("Database connection initialized", {
  host: "localhost",
  database: "lateread.db",
  poolSize: 10,
});

// Warn log
logger.warn("High memory usage detected", {
  usagePercent: 85,
  threshold: 80,
  availableMB: 256,
});

// Error log with Error object
const testError = new Error("Connection timeout");
logger.error("Database query failed", {
  query: "SELECT * FROM articles",
  duration: 5000,
  error: testError,
});

// Custom error class
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const validationError = new ValidationError("Invalid user input");
logger.error("Request validation failed", {
  field: "email",
  value: "invalid-email",
  error: validationError,
});

// Child logger examples
console.log("\n--- Child Logger Examples ---\n");

// Child logger with service context
const serviceLogger = createLogger({ service: "articles" });
serviceLogger.info("Service initialized", { version: "1.0.0" });

// Request-scoped child logger
const reqLogger = serviceLogger.child({ reqId: crypto.randomUUID() });
reqLogger.info("Processing request", { userId: "user-123", action: "fetch" });
reqLogger.debug("Cache check", { cacheKey: "articles:user-123", hit: true });
reqLogger.info("Request completed", { duration: 45, statusCode: 200 });

// Nested child loggers
const operationLogger = reqLogger.child({ operation: "tag-extraction" });
operationLogger.info("Tag extraction started", { articleId: "article-456" });
operationLogger.info("Tag extraction completed", {
  tags: ["tech", "ai", "ml"],
});

console.log("\n=== Demo Complete ===\n");
