import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../lib/db";
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
 * Use dynamic import since this is only used occasionally
 */
healthRoutes.get("/heapsnapshot", async (c) => {
  try {
    // Dynamic import of v8 module
    const v8 = await import("node:v8");

    // Generate heap snapshot and get the file path
    const snapshotPath = v8.writeHeapSnapshot();

    // Read the snapshot file as blob (more memory-efficient than arrayBuffer)
    const file = Bun.file(snapshotPath);
    const blob = await file.blob();

    // Delete the temporary file after reading
    await import("node:fs/promises").then((fs) => fs.unlink(snapshotPath));

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `lateread-heap-${timestamp}.heapsnapshot`;

    // Return the snapshot as a downloadable file
    // Using blob is more efficient than buffer for large files
    return c.body(blob, 200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
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
