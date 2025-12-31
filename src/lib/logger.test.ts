import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createLogger, getLogger, logger } from "./logger";

describe("logger", () => {
  const spyLog = spyOn(console, "log").mockImplementation(() => {});
  const spyError = spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    mock.clearAllMocks();
  });

  describe("log levels", () => {
    it("should log info messages to console.log", () => {
      logger.info("Test message", { key: "value" });

      expect(spyLog).toHaveBeenCalledTimes(1);
      const output = spyLog.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("Test message");
      expect(parsed.key).toBe("value");
      expect(parsed.timestamp).toBeDefined();
    });

    it("should log debug messages to console.log", () => {
      logger.debug("Debug message", { operation: "test" });

      expect(spyLog).toHaveBeenCalledTimes(1);
      const output = spyLog.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("debug");
      expect(parsed.message).toBe("Debug message");
      expect(parsed.operation).toBe("test");
    });

    it("should log warn messages to console.error", () => {
      logger.warn("Warning message", { severity: "medium" });

      expect(spyError).toHaveBeenCalledTimes(1);
      const output = spyError.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("warn");
      expect(parsed.message).toBe("Warning message");
      expect(parsed.severity).toBe("medium");
    });

    it("should log error messages to console.error", () => {
      logger.error("Error message", { critical: true });

      expect(spyError).toHaveBeenCalledTimes(1);
      const output = spyError.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("error");
      expect(parsed.message).toBe("Error message");
      expect(parsed.critical).toBe(true);
    });
  });

  describe("error formatting", () => {
    it("should format Error instances correctly", () => {
      const testError = new Error("Test error");
      logger.error("Operation failed", { error: testError, userId: "123" });

      const output = spyError.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.error).toBeDefined();
      expect(parsed.error.type).toBe("Error");
      expect(parsed.error.message).toBe("Test error");
      expect(parsed.error.stack).toContain("Test error");
      expect(parsed.userId).toBe("123");
    });

    it("should format custom Error subclasses correctly", () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "CustomError";
        }
      }

      const customError = new CustomError("Custom error message");
      logger.error("Custom error occurred", { error: customError });

      const output = spyError.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.error.type).toBe("CustomError");
      expect(parsed.error.message).toBe("Custom error message");
      expect(parsed.error.stack).toMatch(/logger.test/);
    });

    it("should handle non-Error objects", () => {
      const errorLike = { name: "CustomError", message: "Something broke" };
      logger.error("Non-standard error", { error: errorLike });

      const output = spyError.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.error.type).toBe("CustomError");
      expect(parsed.error.message).toBe("Something broke");
    });

    it("should handle primitive error values", () => {
      logger.error("Primitive error", { error: "string error" });

      const output = spyError.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.error.type).toBe("string");
      expect(parsed.error.message).toBe("string error");
    });

    it("should handle null error", () => {
      logger.error("Null error", { error: null });

      const output = spyError.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.error.type).toBe("object");
      expect(parsed.error.message).toBe("null");
    });
  });

  describe("metadata handling", () => {
    it("should include all metadata properties", () => {
      logger.info("Test", {
        userId: "user-123",
        articleId: "article-456",
        duration: 1500,
        success: true,
      });

      const output = spyLog.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.userId).toBe("user-123");
      expect(parsed.articleId).toBe("article-456");
      expect(parsed.duration).toBe(1500);
      expect(parsed.success).toBe(true);
    });

    it("should work without metadata", () => {
      logger.info("Simple message");

      const output = spyLog.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("Simple message");
      expect(parsed.timestamp).toBeDefined();
    });

    it("should handle nested objects in metadata", () => {
      logger.info("Nested data", {
        user: { id: "123", name: "Test User" },
        tags: ["tag1", "tag2"],
      });

      const output = spyLog.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.user).toEqual({ id: "123", name: "Test User" });
      expect(parsed.tags).toEqual(["tag1", "tag2"]);
    });
  });

  describe("child loggers", () => {
    it("should create child logger with merged context", () => {
      const parentLogger = createLogger({ service: "articles" });
      const childLogger = parentLogger.child({ reqId: "req-123" });

      childLogger.info("Processing request");

      const output = spyLog.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.service).toBe("articles");
      expect(parsed.reqId).toBe("req-123");
      expect(parsed.message).toBe("Processing request");
    });

    it("should merge child context with call metadata", () => {
      const childLogger = logger.child({ reqId: "abc-123" });
      childLogger.info("User action", { userId: "user-456", action: "login" });

      const output = spyLog.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.reqId).toBe("abc-123");
      expect(parsed.userId).toBe("user-456");
      expect(parsed.action).toBe("login");
    });

    it("should give call metadata priority over context", () => {
      const childLogger = logger.child({ reqId: "original-123" });
      // Override reqId in call
      childLogger.info("Overriding context", { reqId: "override-456" });

      const output = spyLog.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      // Call metadata should override context
      expect(parsed.reqId).toBe("override-456");
    });

    it("should support multiple levels of child loggers", () => {
      const level1 = createLogger({ service: "api" });
      const level2 = level1.child({ reqId: "req-123" });
      const level3 = level2.child({ operation: "fetch" });

      level3.info("Nested operation", { userId: "user-789" });

      const output = spyLog.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.service).toBe("api");
      expect(parsed.reqId).toBe("req-123");
      expect(parsed.operation).toBe("fetch");
      expect(parsed.userId).toBe("user-789");
    });

    it("should isolate child logger contexts", () => {
      const parent = createLogger({ service: "api" });
      const child1 = parent.child({ reqId: "req-1" });
      const child2 = parent.child({ reqId: "req-2" });

      child1.info("Request 1");
      child2.info("Request 2");

      const output1 = spyLog.mock.calls[0]?.[0];
      const output2 = spyLog.mock.calls[1]?.[0];
      const parsed1 = JSON.parse(output1);
      const parsed2 = JSON.parse(output2);

      expect(parsed1.reqId).toBe("req-1");
      expect(parsed2.reqId).toBe("req-2");
      expect(parsed1.service).toBe("api");
      expect(parsed2.service).toBe("api");
    });

    it("should preserve parent context when child adds new fields", () => {
      const parent = createLogger({ service: "api", version: "1.0" });
      const child = parent.child({ reqId: "req-123" });

      child.info("Test message");

      const output = spyLog.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);

      expect(parsed.service).toBe("api");
      expect(parsed.version).toBe("1.0");
      expect(parsed.reqId).toBe("req-123");
    });

    it("should expose context property on logger", () => {
      const childLogger = logger.child({
        reqId: "abc-123",
        userId: "user-456",
      });

      expect(childLogger.context).toEqual({
        reqId: "abc-123",
        userId: "user-456",
      });
    });
  });

  describe("getLogger", () => {
    it("should return logger from context", () => {
      const mockLogger = createLogger({ reqId: "test-123" });
      const mockContext = {
        get: (key: string) => (key === "logger" ? mockLogger : undefined),
      };

      const result = getLogger(mockContext);

      expect(result).toBe(mockLogger);
      expect(result.context).toEqual({ reqId: "test-123" });
    });

    it("should fallback to root logger when context has no logger", () => {
      const mockContext = {
        get: () => undefined,
      };

      const result = getLogger(mockContext);

      expect(result).toBe(logger);
      expect(result.context).toEqual({});
    });

    it("should fallback to root logger when logger is undefined", () => {
      const mockContext = {
        get: () => undefined,
      };

      const result = getLogger(mockContext);

      expect(result).toBe(logger);
    });
  });
});
