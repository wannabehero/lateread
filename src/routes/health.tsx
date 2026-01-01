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
    c.var.logger.error("Database health check failed", { error });

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

export default healthRoutes;
