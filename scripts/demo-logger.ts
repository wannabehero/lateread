#!/usr/bin/env bun

/**
 * Demo script to show logger output in different environments.
 * Run with:
 *   NODE_ENV=development bun scripts/demo-logger.ts
 *   NODE_ENV=production bun scripts/demo-logger.ts
 */

import { logger } from "../src/lib/logger";

console.log(
  `\n=== Logger Demo (NODE_ENV=${process.env.NODE_ENV || "development"}) ===\n`,
);

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

console.log("\n=== Demo Complete ===\n");
