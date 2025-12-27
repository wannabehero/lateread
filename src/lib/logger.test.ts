import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { logger } from "./logger";

describe("logger", () => {
  let consoleLogMock: ReturnType<typeof mock>;
  let consoleErrorMock: ReturnType<typeof mock>;

  beforeEach(() => {
    consoleLogMock = mock(() => {});
    consoleErrorMock = mock(() => {});
    console.log = consoleLogMock;
    console.error = consoleErrorMock;
  });

  afterEach(() => {
    consoleLogMock.mockRestore();
    consoleErrorMock.mockRestore();
  });

  describe("log levels", () => {
    it("should log info messages to console.log", () => {
      logger.info("Test message", { key: "value" });

      expect(consoleLogMock).toHaveBeenCalledTimes(1);
      const output = consoleLogMock.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("Test message");
      expect(parsed.key).toBe("value");
      expect(parsed.timestamp).toBeDefined();
    });

    it("should log debug messages to console.log", () => {
      logger.debug("Debug message", { operation: "test" });

      expect(consoleLogMock).toHaveBeenCalledTimes(1);
      const output = consoleLogMock.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("debug");
      expect(parsed.message).toBe("Debug message");
      expect(parsed.operation).toBe("test");
    });

    it("should log warn messages to console.error", () => {
      logger.warn("Warning message", { severity: "medium" });

      expect(consoleErrorMock).toHaveBeenCalledTimes(1);
      const output = consoleErrorMock.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("warn");
      expect(parsed.message).toBe("Warning message");
      expect(parsed.severity).toBe("medium");
    });

    it("should log error messages to console.error", () => {
      logger.error("Error message", { critical: true });

      expect(consoleErrorMock).toHaveBeenCalledTimes(1);
      const output = consoleErrorMock.mock.calls[0][0];
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

      const output = consoleErrorMock.mock.calls[0][0];
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

      const output = consoleErrorMock.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.error.type).toBe("CustomError");
      expect(parsed.error.message).toBe("Custom error message");
    });

    it("should handle non-Error objects", () => {
      const errorLike = { name: "CustomError", message: "Something broke" };
      logger.error("Non-standard error", { error: errorLike });

      const output = consoleErrorMock.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.error.type).toBe("CustomError");
      expect(parsed.error.message).toBe("Something broke");
    });

    it("should handle primitive error values", () => {
      logger.error("Primitive error", { error: "string error" });

      const output = consoleErrorMock.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.error.type).toBe("string");
      expect(parsed.error.message).toBe("string error");
    });

    it("should handle null error", () => {
      logger.error("Null error", { error: null });

      const output = consoleErrorMock.mock.calls[0][0];
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

      const output = consoleLogMock.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.userId).toBe("user-123");
      expect(parsed.articleId).toBe("article-456");
      expect(parsed.duration).toBe(1500);
      expect(parsed.success).toBe(true);
    });

    it("should work without metadata", () => {
      logger.info("Simple message");

      const output = consoleLogMock.mock.calls[0][0];
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

      const output = consoleLogMock.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.user).toEqual({ id: "123", name: "Test User" });
      expect(parsed.tags).toEqual(["tag1", "tag2"]);
    });
  });

  describe("message patterns", () => {
    it("should use static messages, not templates", () => {
      // Good: static message with metadata
      logger.info("User logged in", { userId: "123", method: "telegram" });

      const output = consoleLogMock.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.message).toBe("User logged in");
      expect(parsed.userId).toBe("123");
      expect(parsed.method).toBe("telegram");
    });

    it("should separate action from context", () => {
      // Good: action in message, context in metadata
      logger.info("Article processed", {
        articleId: "abc-123",
        duration: 2500,
        tags: ["tech", "ai"],
      });

      const output = consoleLogMock.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.message).toBe("Article processed");
      expect(parsed.articleId).toBe("abc-123");
    });
  });
});
