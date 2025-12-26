import { describe, expect, it } from "bun:test";
import { withTimeout } from "./timeout";

describe("withTimeout", () => {
  it("should resolve with promise value when promise completes before timeout", async () => {
    const promise = Promise.resolve("success");
    const result = await withTimeout(promise, 1000);
    expect(result).toBe("success");
  });

  it("should reject with timeout error when promise takes too long", async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 200));

    expect(withTimeout(promise, 50)).rejects.toThrow("Operation timeout");
  });

  it("should use custom error message when provided", async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 200));

    expect(withTimeout(promise, 50, "Custom timeout message")).rejects.toThrow(
      "Custom timeout message",
    );
  });

  it("should propagate promise rejection", async () => {
    const promise = Promise.reject(new Error("Promise failed"));

    expect(withTimeout(promise, 1000)).rejects.toThrow("Promise failed");
  });
});
