import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { telegramUsers } from "../db/schema";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import type { AppContext } from "../types/context";

const healthRoutes = new Hono<AppContext>();

/**
 * Basic health check endpoint
 * Returns 200 OK if server is running
 */
healthRoutes.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: Date.now(),
  });
});

/**
 * Database health check endpoint
 * Returns 200 OK if database is connected and responsive
 */
healthRoutes.get("/health/db", async (c) => {
  try {
    // Simple query to check database connectivity
    db.run(sql`SELECT 1`);

    return c.json({
      status: "ok",
      database: "connected",
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    return c.json(
      {
        status: "error",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      },
      503,
    );
  }
});

/**
 * Heap snapshot endpoint
 * Generates and returns a V8 heap snapshot file for memory analysis
 * SECURITY: Requires authentication and admin Telegram ID
 * Use dynamic import since this is only used occasionally
 */
healthRoutes.get("/heapsnapshot", requireAuth("json-401"), async (c) => {
  try {
    // Require ADMIN_TELEGRAM_ID to be set - endpoint disabled if not configured
    if (!config.ADMIN_TELEGRAM_ID) {
      return c.json({ error: "Forbidden: Endpoint not configured" }, 403);
    }

    // Check if user has admin Telegram ID
    const userId = c.get("userId") as string;

    const telegramUser = await db.query.telegramUsers.findFirst({
      where: eq(telegramUsers.userId, userId),
    });

    if (!telegramUser || telegramUser.telegramId !== config.ADMIN_TELEGRAM_ID) {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }

    // Dynamic import of v8 module
    const v8 = await import("node:v8");

    // Generate heap snapshot and get the file path
    const snapshotPath = v8.writeHeapSnapshot();

    // Read the snapshot file (BunFile streams efficiently without loading into memory)
    const file = Bun.file(snapshotPath);

    // Note: We don't delete the snapshot file here - let the system handle cleanup
    // Deleting before response completes could cause issues

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `lateread-heap-${timestamp}.heapsnapshot`;

    // Return the snapshot as a downloadable file
    // Using new Response(file) allows Bun to stream the file efficiently
    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Heap snapshot generation failed:", error);

    return c.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      },
      500,
    );
  }
});

export default healthRoutes;
