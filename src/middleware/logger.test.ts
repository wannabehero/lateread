import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
  spyOn,
} from "bun:test";
import type { Context } from "hono";
import { createNoopLogger } from "../../test/fixtures";
import { defaultLogger } from "../lib/logger";
import type { AppContext } from "../types/context";
import { loggerMiddleware } from "./logger";

function createMockContext(options?: {
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
}): Context<AppContext> {
  const requestId = options?.requestId ?? "req-123";
  return {
    get: (key: string) => (key === "requestId" ? requestId : undefined),
    set: mock(() => {}),
    req: {
      method: options?.method ?? "GET",
      path: options?.path ?? "/articles",
    },
    res: {
      status: options?.status ?? 200,
    },
  } as unknown as Context<AppContext>;
}

describe("middleware/logger", () => {
  let mockNext: ReturnType<typeof mock>;
  let spyChild: ReturnType<typeof spyOn<typeof defaultLogger, "child">>;
  let childLogger: ReturnType<typeof createNoopLogger>;
  let spyInfo: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockNext = mock(async () => {});
    childLogger = createNoopLogger();
    spyInfo = spyOn(childLogger, "info");
    spyChild = spyOn(defaultLogger, "child").mockReturnValue(childLogger);
  });

  afterEach(() => {
    // Restore spies to avoid polluting other test files running in parallel
    spyChild.mockRestore();
    setSystemTime(); // Reset system time
  });

  describe("logger creation and setup", () => {
    it("should create child logger with requestId", async () => {
      const c = createMockContext({ requestId: "test-req-id" });

      await loggerMiddleware(c, mockNext);

      expect(spyChild).toHaveBeenCalledWith({
        module: "app",
        reqId: "test-req-id",
      });
    });

    it("should set logger in context", async () => {
      const c = createMockContext();

      await loggerMiddleware(c, mockNext);

      expect(c.set).toHaveBeenCalledWith(
        "logger",
        expect.objectContaining({
          info: expect.any(Function),
          error: expect.any(Function),
          warn: expect.any(Function),
          debug: expect.any(Function),
        }),
      );
    });

    it("should handle missing requestId gracefully", async () => {
      // Create context that explicitly returns undefined for requestId
      const c = {
        get: (_key: string) => undefined,
        set: mock(() => {}),
        req: {
          method: "GET",
          path: "/articles",
        },
        res: {
          status: 200,
        },
      } as unknown as Context<AppContext>;

      await loggerMiddleware(c, mockNext);

      expect(spyChild).toHaveBeenCalledWith({
        module: "app",
        reqId: undefined,
      });
    });
  });

  describe("request logging", () => {
    it("should log request completion with method, path, status", async () => {
      const c = createMockContext({
        method: "POST",
        path: "/api/articles/123",
        status: 201,
      });

      await loggerMiddleware(c, mockNext);

      expect(spyInfo).toHaveBeenCalledWith(
        expect.stringContaining("POST /api/articles/123 201"),
      );
    });

    it("should include duration in log message", async () => {
      const c = createMockContext();

      // Set a fixed start time
      setSystemTime(new Date("2025-01-01T00:00:00.000Z"));

      // Create a next function that advances time
      const delayedNext = mock(async () => {
        // Advance time by 150ms
        setSystemTime(new Date("2025-01-01T00:00:00.150Z"));
      });

      await loggerMiddleware(c, delayedNext);

      expect(spyInfo).toHaveBeenCalledWith(expect.stringContaining("150ms"));
    });

    it("should call next() during request handling", async () => {
      const c = createMockContext();

      await loggerMiddleware(c, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should log even when next() throws an error", async () => {
      const c = createMockContext();
      const errorNext = mock(async () => {
        throw new Error("Handler error");
      });

      // Expect the middleware to throw the error
      await expect(loggerMiddleware(c, errorNext)).rejects.toThrow(
        "Handler error",
      );

      // But it should still log the request (finally block)
      expect(spyInfo).toHaveBeenCalledWith(
        expect.stringContaining("GET /articles"),
      );
    });

    it("should measure duration correctly even when handler throws", async () => {
      const c = createMockContext();

      setSystemTime(new Date("2025-01-01T00:00:00.000Z"));

      const errorNext = mock(async () => {
        setSystemTime(new Date("2025-01-01T00:00:00.050Z"));
        throw new Error("Handler error");
      });

      await expect(loggerMiddleware(c, errorNext)).rejects.toThrow(
        "Handler error",
      );

      expect(spyInfo).toHaveBeenCalledWith(expect.stringContaining("50ms"));
    });
  });

  describe("async handler support", () => {
    it("should work with async handlers", async () => {
      const c = createMockContext();

      const asyncNext = mock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await loggerMiddleware(c, asyncNext);

      expect(asyncNext).toHaveBeenCalled();
      expect(spyInfo).toHaveBeenCalled();
    });
  });

  describe("different request types", () => {
    it.each([
      { method: "GET", path: "/", status: 200 },
      { method: "POST", path: "/api/articles", status: 201 },
      { method: "PUT", path: "/api/articles/123", status: 200 },
      { method: "DELETE", path: "/api/articles/123", status: 204 },
      { method: "PATCH", path: "/api/articles/123", status: 200 },
    ])("should log $method $path with status $status", async ({
      method,
      path,
      status,
    }) => {
      const c = createMockContext({ method, path, status });

      await loggerMiddleware(c, mockNext);

      expect(spyInfo).toHaveBeenCalledWith(
        expect.stringContaining(`${method} ${path} ${status}`),
      );
    });
  });
});
