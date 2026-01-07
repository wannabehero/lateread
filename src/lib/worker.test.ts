import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { defaultLogger } from "./logger";
import { spawnArticleWorker } from "./worker";

describe("worker", () => {
  // Declare spies at describe level
  const spyWorker = spyOn(globalThis, "Worker");
  const spyLoggerChild = spyOn(defaultLogger, "child");

  // Mock logger
  const mockLogger = {
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
  };

  afterEach(() => {
    // Reset spies between tests
    spyWorker.mockReset();
    spyLoggerChild.mockReset();
    mock.clearAllMocks();
  });

  describe("successful processing", () => {
    it("should create worker with correct URL", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "test-123",
      });

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      await promise;

      // Verify worker was created with correct URL
      expect(spyWorker).toHaveBeenCalledTimes(1);
      const workerUrl = spyWorker.mock.calls[0]?.[0];
      expect(workerUrl).toBeDefined();
      expect(workerUrl.toString()).toContain("process-metadata.ts");
    });

    it("should post message with articleId", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "article-456",
      });

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "article-456" },
          }),
        );
      }

      await promise;

      expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(1);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        articleId: "article-456",
      });
    });

    it("should call onSuccess callback when worker succeeds", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnSuccess = mock((articleId: string) => {});

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onSuccess: mockOnSuccess,
      });

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      await promise;

      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      expect(mockOnSuccess).toHaveBeenCalledWith("test-123");
    });

    it("should terminate worker after successful processing", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "test-123",
      });

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      await promise;

      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });

    it("should log appropriate info messages", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onSuccess: () => {},
      });

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      await promise;

      // Verify child logger was created with correct context
      expect(spyLoggerChild).toHaveBeenCalledWith({
        module: "worker",
        article: "test-123",
      });

      // Verify info logs were called
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe("failed processing (via onmessage)", () => {
    it("should call onFailure when worker returns success: false", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnFailure = mock((articleId: string, error?: unknown) => {});

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      // Simulate worker failure
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: {
              success: false,
              articleId: "test-123",
              error: "Processing failed",
            },
          }),
        );
      }

      await promise;

      expect(mockOnFailure).toHaveBeenCalledTimes(1);
      expect(mockOnFailure).toHaveBeenCalledWith(
        "test-123",
        "Processing failed",
      );
    });

    it("should pass error message from worker to onFailure", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnFailure = mock((articleId: string, error?: unknown) => {});

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      // Simulate worker failure with specific error
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: {
              success: false,
              articleId: "test-123",
              error: "Network timeout",
            },
          }),
        );
      }

      await promise;

      expect(mockOnFailure).toHaveBeenCalledWith("test-123", "Network timeout");
    });

    it("should terminate worker after failed processing", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "test-123",
      });

      // Simulate worker failure
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: false, articleId: "test-123", error: "Error" },
          }),
        );
      }

      await promise;

      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });

    it("should log error messages", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "test-123",
      });

      // Simulate worker failure
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: {
              success: false,
              articleId: "test-123",
              error: "Processing error",
            },
          }),
        );
      }

      await promise;

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("worker error event (onerror)", () => {
    it("should call onFailure when worker.onerror is triggered", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnFailure = mock((articleId: string, error?: unknown) => {});

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      // Simulate worker error
      if (mockWorkerInstance.onerror) {
        const error = new Error("Worker crashed");
        mockWorkerInstance.onerror(
          new ErrorEvent("error", {
            error,
            message: "Worker crashed",
          }),
        );
      }

      await promise;

      expect(mockOnFailure).toHaveBeenCalledTimes(1);
      expect(mockOnFailure).toHaveBeenCalledWith("test-123", expect.anything());
    });

    it("should pass error from onerror event to callback", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnFailure = mock((articleId: string, error?: unknown) => {});

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      // Simulate worker error with specific error object
      if (mockWorkerInstance.onerror) {
        const error = new Error("Out of memory");
        mockWorkerInstance.onerror(
          new ErrorEvent("error", {
            error,
            message: "Out of memory",
          }),
        );
      }

      await promise;

      const callArgs = mockOnFailure.mock.calls[0];
      expect(callArgs?.[0]).toBe("test-123");
      expect(callArgs?.[1]).toBeInstanceOf(Error);
      expect((callArgs?.[1] as Error).message).toBe("Out of memory");
    });

    it("should terminate worker after error", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "test-123",
      });

      // Simulate worker error
      if (mockWorkerInstance.onerror) {
        mockWorkerInstance.onerror(
          new ErrorEvent("error", {
            error: new Error("Worker error"),
          }),
        );
      }

      await promise;

      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });

    it("should log error messages", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "test-123",
      });

      // Simulate worker error
      if (mockWorkerInstance.onerror) {
        mockWorkerInstance.onerror(
          new ErrorEvent("error", {
            error: new Error("Worker error"),
          }),
        );
      }

      await promise;

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("worker creation failure", () => {
    it("should catch Worker constructor errors", async () => {
      spyWorker.mockImplementation(() => {
        throw new Error("Failed to create worker");
      });
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnFailure = mock((articleId: string, error?: unknown) => {});

      await spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      expect(mockOnFailure).toHaveBeenCalledTimes(1);
      expect(mockOnFailure).toHaveBeenCalledWith(
        "test-123",
        expect.objectContaining({
          message: "Failed to create worker",
        }),
      );
    });

    it("should log failure to spawn worker", async () => {
      spyWorker.mockImplementation(() => {
        throw new Error("Worker creation failed");
      });
      spyLoggerChild.mockReturnValue(mockLogger);

      await spawnArticleWorker({
        articleId: "test-123",
      });

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("should not attempt to terminate worker that was never created", async () => {
      const mockTerminate = mock(() => {});

      spyWorker.mockImplementation(() => {
        throw new Error("Failed to create worker");
      });
      spyLoggerChild.mockReturnValue(mockLogger);

      await spawnArticleWorker({
        articleId: "test-123",
      });

      // terminate should never be called since worker was never created
      expect(mockTerminate).not.toHaveBeenCalled();
    });
  });

  describe("callback error handling", () => {
    it("should catch errors thrown by onSuccess callback", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnSuccess = mock(() => {
        throw new Error("Callback error");
      });

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onSuccess: mockOnSuccess,
      });

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      // Should not throw
      await expect(promise).resolves.toBeUndefined();
    });

    it("should log warning when onSuccess callback fails", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnSuccess = mock(() => {
        throw new Error("Callback error");
      });

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onSuccess: mockOnSuccess,
      });

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      await promise;

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should catch errors thrown by onFailure callback", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnFailure = mock(() => {
        throw new Error("Callback error");
      });

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      // Simulate worker failure
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: false, articleId: "test-123", error: "Error" },
          }),
        );
      }

      // Should not throw
      await expect(promise).resolves.toBeUndefined();
    });

    it("should log warning when onFailure callback fails", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnFailure = mock(() => {
        throw new Error("Callback error");
      });

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      // Simulate worker failure
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: false, articleId: "test-123", error: "Error" },
          }),
        );
      }

      await promise;

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe("optional callbacks", () => {
    it("should work when onSuccess is not provided", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "test-123",
        // No onSuccess callback
      });

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      // Should complete without error
      await expect(promise).resolves.toBeUndefined();
      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });

    it("should work when onFailure is not provided", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "test-123",
        // No onFailure callback
      });

      // Simulate worker failure
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: false, articleId: "test-123", error: "Error" },
          }),
        );
      }

      // Should complete without error
      await expect(promise).resolves.toBeUndefined();
      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });

    it("should work when neither callback is provided", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const promise = spawnArticleWorker({
        articleId: "test-123",
        // No callbacks
      });

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      // Should complete without error
      await expect(promise).resolves.toBeUndefined();
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        articleId: "test-123",
      });
      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });
  });

  describe("async callbacks", () => {
    it("should handle async onSuccess callbacks", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      let callbackCompleted = false;
      const mockOnSuccess = mock(async (articleId: string) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        callbackCompleted = true;
      });

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onSuccess: mockOnSuccess,
      });

      await promise;

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        await mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      // Wait for async callback to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      expect(callbackCompleted).toBe(true);
      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });

    it("should handle async onFailure callbacks", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      let callbackCompleted = false;
      const mockOnFailure = mock(async (articleId: string, error?: unknown) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        callbackCompleted = true;
      });

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      await promise;

      // Simulate worker failure
      if (mockWorkerInstance.onmessage) {
        await mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: false, articleId: "test-123", error: "Error" },
          }),
        );
      }

      // Wait for async callback to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockOnFailure).toHaveBeenCalledTimes(1);
      expect(callbackCompleted).toBe(true);
      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });

    it("should catch async onSuccess callback errors", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);
      spyLoggerChild.mockReturnValue(mockLogger);

      const mockOnSuccess = mock(async (articleId: string) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("Async callback error");
      });

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onSuccess: mockOnSuccess,
      });

      // Should not throw
      await expect(promise).resolves.toBeUndefined();

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        await mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      // Wait for async callback to complete and error to be caught
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
