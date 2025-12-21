import { users } from "../src/db/schema.ts";
import { db, runMigrations, sqliteConnection } from "../src/lib/db.ts";

console.log("Testing database connection...");

// Run migrations
runMigrations();

// Test a simple query
console.log("Testing database query...");
const result = await db.select().from(users).limit(1);
console.log("Database query successful");
console.log(`Users in database: ${result.length}`);

// Check WAL mode
const walMode = sqliteConnection.query("PRAGMA journal_mode;").get();
console.log(`Journal mode: ${JSON.stringify(walMode)}`);

// Check foreign keys
const fkStatus = sqliteConnection.query("PRAGMA foreign_keys;").get();
console.log(`Foreign keys: ${JSON.stringify(fkStatus)}`);

console.log("All database tests passed");

sqliteConnection.close();
