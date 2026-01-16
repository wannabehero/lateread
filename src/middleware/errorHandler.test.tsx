import { describe, expect, it, mock, spyOn } from "bun:test";
import type { Context } from "hono";
import { createNoopLogger } from "../../test/fixtures";
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../lib/errors";
import type { AppContext } from "../types/context";
import { errorHandler } from "./errorHandler";

// Note: We don't need to mock renderWithLayout here because:
// 1. The test uses a fully mocked context where c.html is already mocked
// 2. render.tsx now handles the test environment properly (NODE_ENV=test fallback)
// Using mock.module() would affect ALL test files globally due to Bun's hoisting

function createMockContext(options?: {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  userId?: string;
}): Context<AppContext> {
  const logger = createNoopLogger();
  const _spyLoggerError = spyOn(logger, "error");
  const _spyLoggerWarn = spyOn(logger, "warn");

  const context = {
    req: {
      path: options?.path ?? "/",
      method: options?.method ?? "GET",
      header: (name: string) =>
        options?.headers?.[name.toLowerCase()] ?? undefined,
    },
    get: (key: string) => {
      if (key === "userId") return options?.userId;
      return undefined;
    },
    var: { logger },
    header: mock(() => {}),
    html: mock(
      (content: unknown, status?: number) =>
        new Response(String(content), { status }),
    ),
    json: mock(
      (data: unknown, status?: number) =>
        new Response(JSON.stringify(data), { status }),
    ),
  } as unknown as Context<AppContext>;

  return context;
}

describe("middleware/errorHandler", () => {
  describe("error conversion", () => {
    it("should convert generic Error to InternalError", () => {
      const c = createMockContext({ path: "/api/test" });
      const genericError = new Error("Something went wrong");

      errorHandler(genericError, c);

      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "An unexpected error occurred",
          statusCode: 500,
        }),
        500,
      );
    });

    it("should preserve AppError instances", () => {
      const c = createMockContext({ path: "/api/test" });
      const notFoundError = new NotFoundError("Article", "123");

      errorHandler(notFoundError, c);

      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Article not found",
          statusCode: 404,
        }),
        404,
      );
    });
  });

  describe("logging", () => {
    it("should log 5xx errors as error level", () => {
      const c = createMockContext();
      const internalError = new InternalError("Server error");

      errorHandler(internalError, c);

      expect(c.var.logger.error).toHaveBeenCalledWith(
        "Unexpected error",
        expect.objectContaining({
          statusCode: 500,
        }),
      );
    });

    it("should log 4xx errors as warn level", () => {
      const c = createMockContext();
      const notFoundError = new NotFoundError("Article");

      errorHandler(notFoundError, c);

      expect(c.var.logger.warn).toHaveBeenCalledWith(
        "Operational error",
        expect.objectContaining({
          statusCode: 404,
        }),
      );
    });

    it("should include error context in logs", () => {
      const c = createMockContext({
        path: "/articles/123",
        method: "GET",
        userId: "user456",
      });
      const error = new NotFoundError("Article", "123");

      errorHandler(error, c);

      expect(c.var.logger.warn).toHaveBeenCalledWith(
        "Operational error",
        expect.objectContaining({
          path: "/articles/123",
          method: "GET",
          userId: "user456",
          statusCode: 404,
          resource: "Article",
          id: "123",
        }),
      );
    });
  });

  describe("request type detection and responses", () => {
    describe("HTMX requests", () => {
      it("should detect HTMX requests via HX-Request header", () => {
        const c = createMockContext({
          headers: { "hx-request": "true" },
        });
        const error = new NotFoundError("Article");

        errorHandler(error, c);

        expect(c.header).toHaveBeenCalledWith("hx-reswap", "outerHTML");
        expect(c.html).toHaveBeenCalledWith(expect.anything(), 200);
      });

      it("should return ErrorPartial with 200 status for HTMX", () => {
        const c = createMockContext({
          headers: { "hx-request": "true" },
        });
        const error = new ValidationError("Invalid input");

        errorHandler(error, c);

        // HTMX responses always return 200 to allow swap
        expect(c.html).toHaveBeenCalledWith(expect.anything(), 200);
      });

      it("should set hx-reswap header for HTMX responses", () => {
        const c = createMockContext({
          headers: { "hx-request": "true" },
        });
        const error = new ForbiddenError("Access denied");

        errorHandler(error, c);

        expect(c.header).toHaveBeenCalledWith("hx-reswap", "outerHTML");
      });
    });

    describe("JSON API requests", () => {
      it("should detect JSON requests via Accept header", () => {
        const c = createMockContext({
          headers: { accept: "application/json" },
        });
        const error = new NotFoundError("Article");

        errorHandler(error, c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: "Article not found",
            statusCode: 404,
          }),
          404,
        );
      });

      it("should detect JSON requests via /api/ path", () => {
        const c = createMockContext({
          path: "/api/articles/123",
        });
        const error = new UnauthorizedError();

        errorHandler(error, c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: "Authentication required",
            statusCode: 401,
          }),
          401,
        );
      });

      it("should return structured JSON error", () => {
        const c = createMockContext({
          path: "/api/articles",
        });
        const error = new ValidationError("Invalid data", {
          field: "title",
        });

        errorHandler(error, c);

        expect(c.json).toHaveBeenCalledWith(
          {
            error: "Invalid data",
            statusCode: 400,
            context: { fields: { field: "title" } },
          },
          400,
        );
      });

      it("should include error context in JSON response", () => {
        const c = createMockContext({
          headers: { accept: "application/json" },
        });
        const error = new NotFoundError("Article", "123");

        errorHandler(error, c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            context: {
              resource: "Article",
              id: "123",
            },
          }),
          404,
        );
      });
    });

    describe("HTML requests", () => {
      it("should detect HTML requests as default", () => {
        const c = createMockContext({
          path: "/articles",
        });
        const error = new NotFoundError("Article");

        errorHandler(error, c);

        // Should call renderWithLayout via html response
        expect(c.html).toHaveBeenCalled();
      });

      it("should return HTML for browser navigation", () => {
        const c = createMockContext({
          headers: { accept: "text/html" },
        });
        const error = new InternalError("Server error");

        errorHandler(error, c);

        expect(c.html).toHaveBeenCalled();
      });
    });
  });

  describe("status codes", () => {
    it.each([
      [new NotFoundError("Article"), 404],
      [new UnauthorizedError(), 401],
      [new ForbiddenError(), 403],
      [new ValidationError("Invalid"), 400],
      [new InternalError("Error"), 500],
    ])("should return correct status code for %s", (error, expectedStatus) => {
      const c = createMockContext({
        path: "/api/test",
      });

      errorHandler(error, c);

      expect(c.json).toHaveBeenCalledWith(expect.anything(), expectedStatus);
    });
  });

  describe("edge cases", () => {
    it("should handle errors without context", () => {
      const c = createMockContext({ path: "/api/test" });
      const error = new UnauthorizedError();

      errorHandler(error, c);

      expect(c.json).toHaveBeenCalledWith(
        {
          error: "Authentication required",
          statusCode: 401,
        },
        401,
      );
    });

    it("should handle errors with userId in context", () => {
      const c = createMockContext({ userId: "user123" });
      const error = new ForbiddenError();

      errorHandler(error, c);

      expect(c.var.logger.warn).toHaveBeenCalledWith(
        "Operational error",
        expect.objectContaining({
          userId: "user123",
        }),
      );
    });

    it("should handle HTMX request with 5xx error", () => {
      const c = createMockContext({
        headers: { "hx-request": "true" },
      });
      const error = new InternalError("Server error");

      errorHandler(error, c);

      // Even 5xx errors return 200 for HTMX to allow swap
      expect(c.html).toHaveBeenCalledWith(expect.anything(), 200);
      expect(c.var.logger.error).toHaveBeenCalled();
    });
  });
});
