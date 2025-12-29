import { Database } from "bun:sqlite";
import { mock } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../src/db/schema";

function prepareDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL;");
  sqlite.run("PRAGMA foreign_keys = ON;");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });

  mock.module("../src/lib/db", () => ({
    db,
    runMigrations: () => {
      // Migrations are already run above
      // This is a no-op in tests
    },
  }));

  return db;
}

let db = prepareDatabase();

export function resetDatabase() {
  db = prepareDatabase();
}

export { db };
