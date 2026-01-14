#!/usr/bin/env bun

/**
 * Backup the SQLite database to a specified path
 *
 * This script creates a backup copy of the main SQLite database using SQLite's
 * native backup API. This is safe for databases with WAL mode enabled and ensures
 * a consistent snapshot of the database.
 *
 * Usage: bun run ops/backup-db.ts <backup-path>
 * Example: bun run ops/backup-db.ts /tmp/backup-2024-01-14.db
 *
 * Exit codes:
 * - 0: Success
 * - 1: Error (invalid arguments, file not found, backup failed)
 */

import { Database } from "bun:sqlite";
import { config } from "../src/lib/config";
import { defaultLogger } from "../src/lib/logger";

const logger = defaultLogger.child({ module: "backup-db" });

async function backupDatabase() {
  // Get backup path from command line arguments
  const backupPath = process.argv[2];

  if (!backupPath) {
    logger.error("No backup path provided");
    console.error("Usage: bun run ops/backup-db.ts <backup-path>");
    console.error("Example: bun run ops/backup-db.ts /tmp/backup.db");
    process.exit(1);
  }

  const dbPath = config.DATABASE_URL;

  logger.info("Starting database backup", {
    source: dbPath,
    destination: backupPath,
  });

  let sourceDb: Database | null = null;

  try {
    // Check if source database exists
    const sourceFile = Bun.file(dbPath);
    if (!(await sourceFile.exists())) {
      logger.error("Source database file not found", { path: dbPath });
      console.error(`Error: Database file not found at ${dbPath}`);
      process.exit(1);
    }

    // Get database file size for logging
    const sourceSize = sourceFile.size;
    logger.info("Source database found", {
      size: sourceSize,
      sizeHuman: `${(sourceSize / 1024 / 1024).toFixed(2)} MB`,
    });

    // Open source database connection
    sourceDb = new Database(dbPath, { readonly: true });

    logger.info("Performing SQLite backup using native API");

    // Perform the backup using SQLite's native backup API
    // This is safe for WAL mode and creates a consistent snapshot
    sourceDb.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);

    logger.info("SQLite backup completed");

    // Verify the backup was created successfully
    const backupFile = Bun.file(backupPath);
    if (!(await backupFile.exists())) {
      logger.error("Backup file was not created", { path: backupPath });
      console.error(`Error: Failed to create backup at ${backupPath}`);
      process.exit(1);
    }

    const backupSize = backupFile.size;

    logger.info("Database backup completed successfully", {
      destination: backupPath,
      size: backupSize,
      sizeHuman: `${(backupSize / 1024 / 1024).toFixed(2)} MB`,
    });

    console.log(`✓ Backup created successfully: ${backupPath}`);
    console.log(`✓ Size: ${(backupSize / 1024 / 1024).toFixed(2)} MB`);
    process.exit(0);
  } catch (error) {
    logger.error("Database backup failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  } finally {
    // Close the database connection
    if (sourceDb) {
      try {
        sourceDb.close();
        logger.debug("Database connection closed");
      } catch (closeError) {
        logger.warn("Failed to close database connection", {
          error: closeError,
        });
      }
    }
  }
}

// Run the backup
backupDatabase();
