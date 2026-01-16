import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import type { Context } from "hono";
import * as sessionLib from "../lib/session";
import type { AppContext } from "../types/context";
import { session } from "./session";

function createMockContext(): Context<AppContext> {
  return {
    set: mock(() => {}),
  } as unknown as Context<AppContext>;
}

describe("middleware/session", () => {
  let mockNext: ReturnType<typeof mock>;
  let spyGetSession: ReturnType<typeof spyOn<typeof sessionLib, "getSession">>;

  beforeEach(() => {
    mockNext = mock(async () => {});
    spyGetSession = spyOn(sessionLib, "getSession");
  });

  afterEach(() => {
    spyGetSession.mockRestore();
  });

  describe("session extraction", () => {
    it("should set userId in context when session exists", async () => {
      const c = createMockContext();
      spyGetSession.mockReturnValue({ userId: "user123" } as any);

      const middleware = session();
      await middleware(c, mockNext);

      expect(spyGetSession).toHaveBeenCalledWith(c);
      expect(c.set).toHaveBeenCalledWith("userId", "user123");
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should not set userId when session is null", async () => {
      const c = createMockContext();
      spyGetSession.mockReturnValue(null);

      const middleware = session();
      await middleware(c, mockNext);

      expect(spyGetSession).toHaveBeenCalledWith(c);
      expect(c.set).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should not set userId when session exists but has no userId", async () => {
      const c = createMockContext();
      // Session object without userId (edge case)
      spyGetSession.mockReturnValue({} as any);

      const middleware = session();
      await middleware(c, mockNext);

      expect(c.set).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("next() handling", () => {
    it("should call next() when session exists", async () => {
      const c = createMockContext();
      spyGetSession.mockReturnValue({ userId: "user123" } as any);

      const middleware = session();
      await middleware(c, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should call next() when session is null", async () => {
      const c = createMockContext();
      spyGetSession.mockReturnValue(null);

      const middleware = session();
      await middleware(c, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should propagate errors from next()", async () => {
      const c = createMockContext();
      spyGetSession.mockReturnValue({ userId: "user123" } as any);

      const errorNext = mock(async () => {
        throw new Error("Handler error");
      });

      const middleware = session();

      await expect(middleware(c, errorNext)).rejects.toThrow("Handler error");
    });
  });

  describe("session data handling", () => {
    it("should handle different userId values", async () => {
      const testCases = [
        "user123",
        "12345",
        "uuid-abc-def",
        "a".repeat(100), // Long userId
      ];

      for (const userId of testCases) {
        const c = createMockContext();
        spyGetSession.mockReturnValue({ userId } as any);

        const middleware = session();
        await middleware(c, mockNext);

        expect(c.set).toHaveBeenCalledWith("userId", userId);
        spyGetSession.mockClear();
      }
    });

    it("should call getSession with correct context", async () => {
      const c = createMockContext();
      spyGetSession.mockReturnValue({ userId: "user123" } as any);

      const middleware = session();
      await middleware(c, mockNext);

      // Verify getSession was called with the context object
      expect(spyGetSession).toHaveBeenCalledWith(c);
      expect(spyGetSession).toHaveBeenCalledTimes(1);
    });
  });
});
