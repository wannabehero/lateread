import { describe, expect, it } from "bun:test";
import {
  type AppError,
  ExternalServiceError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";

describe("errors", () => {
  describe("NotFoundError", () => {
    it("should create error with correct shape", () => {
      const error = new NotFoundError("Article", "123");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.name).toBe("NotFoundError");
      expect(error.message).toBe("Article not found");
      expect(error.statusCode).toBe(404);
      expect(error.context).toEqual({ resource: "Article", id: "123" });
    });

    it("should create error without id", () => {
      const error = new NotFoundError("User");

      expect(error.message).toBe("User not found");
      expect(error.context).toEqual({ resource: "User", id: undefined });
    });
  });

  describe("UnauthorizedError", () => {
    it("should create error with default message", () => {
      const error = new UnauthorizedError();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.name).toBe("UnauthorizedError");
      expect(error.message).toBe("Authentication required");
      expect(error.statusCode).toBe(401);
      expect(error.context).toBeUndefined();
    });

    it("should create error with custom message", () => {
      const error = new UnauthorizedError("Invalid token");

      expect(error.message).toBe("Invalid token");
      expect(error.statusCode).toBe(401);
    });
  });

  describe("ForbiddenError", () => {
    it("should create error with default message", () => {
      const error = new ForbiddenError();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.name).toBe("ForbiddenError");
      expect(error.message).toBe("Access denied");
      expect(error.statusCode).toBe(403);
      expect(error.context).toBeUndefined();
    });

    it("should create error with custom message", () => {
      const error = new ForbiddenError("You don't have access to this article");

      expect(error.message).toBe("You don't have access to this article");
      expect(error.statusCode).toBe(403);
    });
  });

  describe("ValidationError", () => {
    it("should create error with correct shape", () => {
      const fields = { url: "not a valid URL", title: "too long" };
      const error = new ValidationError("Invalid input", fields);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe("ValidationError");
      expect(error.message).toBe("Invalid input");
      expect(error.statusCode).toBe(400);
      expect(error.context).toEqual({ fields });
    });

    it("should create error without fields", () => {
      const error = new ValidationError("Invalid data");

      expect(error.message).toBe("Invalid data");
      expect(error.context).toEqual({ fields: undefined });
    });
  });

  describe("ExternalServiceError", () => {
    it("should create error with correct shape", () => {
      const originalError = new Error("Connection timeout");
      const error = new ExternalServiceError("Readability", originalError);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ExternalServiceError);
      expect(error.name).toBe("ExternalServiceError");
      expect(error.message).toBe("External service error: Readability");
      expect(error.statusCode).toBe(503);
      expect(error.context).toEqual({
        service: "Readability",
        originalMessage: "Connection timeout",
      });
    });

    it("should create error without original error", () => {
      const error = new ExternalServiceError("LLM API");

      expect(error.message).toBe("External service error: LLM API");
      expect(error.context).toEqual({
        service: "LLM API",
        originalMessage: undefined,
      });
    });
  });

  describe("InternalError", () => {
    it("should create error with default message", () => {
      const error = new InternalError();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(InternalError);
      expect(error.name).toBe("InternalError");
      expect(error.message).toBe("Internal server error");
      expect(error.statusCode).toBe(500);
      expect(error.context).toBeUndefined();
    });

    it("should create error with custom message", () => {
      const error = new InternalError("Unexpected state");

      expect(error.message).toBe("Unexpected state");
      expect(error.statusCode).toBe(500);
      expect(error.context).toBeUndefined();
    });

    it("should create error with message and context", () => {
      const context = { articleId: "123", state: "invalid" };
      const error = new InternalError("Unexpected state", context);

      expect(error.message).toBe("Unexpected state");
      expect(error.statusCode).toBe(500);
      expect(error.context).toEqual(context);
    });

    it("should create error with default message and context", () => {
      const context = { foo: "bar" };
      const error = new InternalError(undefined, context);

      expect(error.message).toBe("Internal server error");
      expect(error.context).toEqual(context);
    });
  });

  describe("AppError base class behavior", () => {
    it("should set error name from constructor name", () => {
      const errors: AppError[] = [
        new NotFoundError("Test"),
        new UnauthorizedError(),
        new ForbiddenError(),
        new ValidationError("Test"),
        new ExternalServiceError("Test"),
        new InternalError(),
      ];

      for (const error of errors) {
        expect(error.name).toBe(error.constructor.name);
      }
    });

    it("should be throwable and catchable", () => {
      expect(() => {
        throw new NotFoundError("Article", "123");
      }).toThrow(NotFoundError);

      expect(() => {
        throw new ValidationError("Invalid");
      }).toThrow(ValidationError);
    });

    it("should preserve error stack trace", () => {
      const error = new NotFoundError("Article", "123");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("NotFoundError");
    });
  });
});
