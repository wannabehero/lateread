// IMPORTANT: Config must be imported FIRST before any other modules
import { config } from "./lib/config.ts";
import { runMigrations } from "./lib/db.ts";

console.log("Starting lateread...");
console.log(`Environment: ${config.NODE_ENV}`);
console.log(`Port: ${config.PORT}`);

// Run database migrations
runMigrations();
