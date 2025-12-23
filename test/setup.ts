import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../src/db/schema";

export interface TestDatabase {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database;
  cleanup: () => void;
}

/**
 * Create an in-memory SQLite database for testing
 * Runs all migrations to set up schema
 *
 * Usage pattern:
 * ```typescript
 * import { mock } from "bun:test";
 * import { createTestDatabase, resetDatabase } from "../../test/setup";
 *
 * const testDb = createTestDatabase();
 * const { db } = testDb;
 *
 * // Mock the production db import
 * mock.module("./db", () => ({ db }));
 *
 * describe("my tests", () => {
 *   beforeEach(async () => {
 *     await resetDatabase(db);
 *   });
 *   // ... tests
 * });
 * ```
 */
export function createTestDatabase(): TestDatabase {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL;");
  sqlite.run("PRAGMA foreign_keys = ON;");

  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: "./drizzle" });

  const cleanup = () => {
    sqlite.close();
  };

  return { db, sqlite, cleanup };
}

/**
 * Helper to reset all tables in a test database
 * Useful for ensuring clean state between tests
 */
export async function resetDatabase(
  db: ReturnType<typeof drizzle<typeof schema>>,
) {
  await db.delete(schema.authTokens);
  await db.delete(schema.telegramUsers);
  await db.delete(schema.users);
  await db.delete(schema.tags);
  await db.delete(schema.articles);
  await db.delete(schema.articleSummaries);
  await db.delete(schema.articleTags);
}

/**
 * Wait for a condition to be true (for polling tests)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 100;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}
