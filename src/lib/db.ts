import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../db/schema.ts";
import { config } from "./config.ts";

// Ensure database directory exists
const dbPath = config.DATABASE_URL;
const dbDir = dirname(dbPath);

try {
  await mkdir(dbDir, { recursive: true });
} catch {
  // Directory might already exist, that's ok
}

// Create SQLite connection using Bun's native API
const sqlite = new Database(dbPath, { create: true });

// Enable WAL mode for better concurrency
sqlite.run("PRAGMA journal_mode = WAL;");
sqlite.run("PRAGMA foreign_keys = ON;");

// Set busy timeout to 5 seconds to avoid BUSY errors
sqlite.run("PRAGMA busy_timeout = 5000;");

// Initialize Drizzle ORM with SQLite dialect
export const db = drizzle(sqlite, { schema });

// Run migrations function
export function runMigrations() {
  console.log("Running database migrations...");
  try {
    migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

// Export the raw SQLite connection for advanced use cases
export const sqliteConnection = sqlite;
