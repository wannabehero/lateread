import {
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
  spyOn,
} from "bun:test";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { resetDatabase } from "../../test/bootstrap";
import { createApp } from "../app";
import * as dbModule from "../lib/db";
import type { AppContext } from "../types/context";

describe("routes/health", () => {
  let app: Hono<AppContext>;

  beforeEach(() => {
    // Reset system time in case other tests froze it
    setSystemTime();
    resetDatabase();
    app = createApp();
  });

  describe("GET /health", () => {
    it("should return 200 with status ok and timestamp", async () => {
      const beforeRequest = Date.now();

      const res = await app.request("/health");

      const afterRequest = Date.now();

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");

      const json = await res.json();

      expect(json).toHaveProperty("status", "ok");
      expect(json).toHaveProperty("timestamp");
      expect(typeof json.timestamp).toBe("number");

      // Timestamp should be within reasonable range
      expect(json.timestamp).toBeGreaterThanOrEqual(beforeRequest);
      expect(json.timestamp).toBeLessThanOrEqual(afterRequest);
    });

    it("should not require authentication", async () => {
      // No session setup, request should still succeed
      const res = await app.request("/health");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
    });

    it("should return different timestamps for consecutive requests", async () => {
      const res1 = await app.request("/health");
      const json1 = await res1.json();

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 5));

      const res2 = await app.request("/health");
      const json2 = await res2.json();

      expect(json1.timestamp).not.toBe(json2.timestamp);
      expect(json2.timestamp).toBeGreaterThan(json1.timestamp);
    });
  });

  describe("GET /health/db", () => {
    it("should return 200 with database connected status", async () => {
      const beforeRequest = Date.now();

      const res = await app.request("/health/db");

      const afterRequest = Date.now();

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");

      const json = await res.json();

      expect(json).toEqual({
        status: "ok",
        database: "connected",
        timestamp: expect.any(Number),
      });

      // Timestamp should be within reasonable range
      expect(json.timestamp).toBeGreaterThanOrEqual(beforeRequest);
      expect(json.timestamp).toBeLessThanOrEqual(afterRequest);
    });

    it("should not require authentication", async () => {
      // No session setup, request should still succeed
      const res = await app.request("/health/db");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.database).toBe("connected");
    });

    it("should return 503 when database is unavailable", async () => {
      // Spy on db.run to simulate database error
      const spyDbRun = spyOn(dbModule.db, "run");
      spyDbRun.mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      const beforeRequest = Date.now();

      const res = await app.request("/health/db");

      const afterRequest = Date.now();

      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).toContain("application/json");

      const json = await res.json();

      expect(json).toEqual({
        status: "error",
        database: "disconnected",
        error: "Database connection failed",
        timestamp: expect.any(Number),
      });

      // Timestamp should be within reasonable range
      expect(json.timestamp).toBeGreaterThanOrEqual(beforeRequest);
      expect(json.timestamp).toBeLessThanOrEqual(afterRequest);

      expect(spyDbRun).toHaveBeenCalledWith(sql`SELECT 1`);

      spyDbRun.mockRestore();
    });

    it("should handle non-Error exceptions", async () => {
      // Spy on db.run to simulate non-Error exception
      const spyDbRun = spyOn(dbModule.db, "run");
      spyDbRun.mockImplementation(() => {
        // biome-ignore lint/suspicious/noExplicitAny: Testing non-Error exception
        throw "String error" as any;
      });

      const res = await app.request("/health/db");

      expect(res.status).toBe(503);

      const json = await res.json();

      expect(json).toEqual({
        status: "error",
        database: "disconnected",
        error: "Unknown error",
        timestamp: expect.any(Number),
      });

      spyDbRun.mockRestore();
    });

    it("should return different timestamps for consecutive requests", async () => {
      const res1 = await app.request("/health/db");
      const json1 = await res1.json();

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 5));

      const res2 = await app.request("/health/db");
      const json2 = await res2.json();

      expect(json1.timestamp).not.toBe(json2.timestamp);
      expect(json2.timestamp).toBeGreaterThan(json1.timestamp);
    });

    it("should successfully execute SELECT 1 query", async () => {
      const spyDbRun = spyOn(dbModule.db, "run");
      const mockRunResult = { changes: 0, lastInsertRowid: 0, rows: [] };
      spyDbRun.mockReturnValue(mockRunResult);

      const res = await app.request("/health/db");

      expect(res.status).toBe(200);
      expect(spyDbRun).toHaveBeenCalledWith(sql`SELECT 1`);

      spyDbRun.mockRestore();
    });

    it("should handle timeout errors", async () => {
      const spyDbRun = spyOn(dbModule.db, "run");
      spyDbRun.mockImplementation(() => {
        throw new Error("Query timeout");
      });

      const res = await app.request("/health/db");

      expect(res.status).toBe(503);

      const json = await res.json();

      expect(json.error).toBe("Query timeout");
      expect(json.database).toBe("disconnected");

      spyDbRun.mockRestore();
    });
  });
});
