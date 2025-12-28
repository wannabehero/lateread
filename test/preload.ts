/**
 * Test preload script - runs before all tests
 * Sets up global mocks for the db module
 */

import { Database } from "bun:sqlite";
import { mock } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../src/db/schema";

// Create an in-memory SQLite database for testing
const sqlite = new Database(":memory:");
sqlite.run("PRAGMA journal_mode = WAL;");
sqlite.run("PRAGMA foreign_keys = ON;");

const db = drizzle(sqlite, { schema });

// Run migrations to set up schema
migrate(db, { migrationsFolder: "./drizzle" });

// Export for use in tests
export { db, sqlite };

// Globally mock the db module to use the test database
mock.module("../src/lib/db", () => ({
  db,
  sqliteConnection: sqlite,
  runMigrations: () => {
    // Migrations are already run above
    // This is a no-op in tests
  },
}));

console.log("[test/preload] Database module mocked globally");
