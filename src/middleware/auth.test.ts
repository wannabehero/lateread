import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Context, Next } from "hono";
import type { AppContext } from "../types/context";
import { requireAuth } from "./auth";

function createMockContext(userId?: string): Context<AppContext> {
  const context = {
    get: (key: string) => (key === "userId" ? userId : undefined),
    redirect: mock(() => new Response("", { status: 302 })),
    json: mock((data: unknown, status?: number) =>
      new Response(JSON.stringify(data), { status }),
    ),
  } as unknown as Context<AppContext>;
  return context;
}

describe("middleware/auth", () => {
  let mockNext: ReturnType<typeof mock>;

  beforeEach(() => {
    mockNext = mock(async () => {});
  });

  describe("requireAuth('redirect')", () => {
    it("should redirect to / when userId is missing", async () => {
      const c = createMockContext(undefined);
      const middleware = requireAuth("redirect");

      await middleware(c, mockNext);

      expect(c.redirect).toHaveBeenCalledWith("/");
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next when userId exists", async () => {
      const c = createMockContext("user123");
      const middleware = requireAuth("redirect");

      await middleware(c, mockNext);

      expect(c.redirect).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should use redirect strategy by default", async () => {
      const c = createMockContext(undefined);
      const middleware = requireAuth(); // No argument

      await middleware(c, mockNext);

      expect(c.redirect).toHaveBeenCalledWith("/");
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("requireAuth('json-401')", () => {
    it("should return 401 JSON when userId is missing", async () => {
      const c = createMockContext(undefined);
      const middleware = requireAuth("json-401");

      await middleware(c, mockNext);

      expect(c.json).toHaveBeenCalledWith({ error: "Unauthorized" }, 401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next when userId exists", async () => {
      const c = createMockContext("user123");
      const middleware = requireAuth("json-401");

      await middleware(c, mockNext);

      expect(c.json).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("userId handling", () => {
    it("should correctly read userId from context", async () => {
      const c = createMockContext("test-user-id");
      const middleware = requireAuth("redirect");

      await middleware(c, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should treat empty string userId as missing", async () => {
      // Empty string is falsy in JavaScript
      const c = createMockContext("");
      const middleware = requireAuth("redirect");

      await middleware(c, mockNext);

      expect(c.redirect).toHaveBeenCalledWith("/");
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
