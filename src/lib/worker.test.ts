import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { defaultLogger } from "./logger";
import { spawnArticleWorker } from "./worker";

describe("worker", () => {
  // Declare spies at describe level
  const spyWorker = spyOn(globalThis, "Worker");
  const spyLoggerChild = spyOn(defaultLogger, "child");

  // Mock logger - will be set up in each test
  let mockLogger: {
    info: ReturnType<typeof mock>;
    error: ReturnType<typeof mock>;
    warn: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    // Create fresh mock logger for each test
    mockLogger = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
    };
    spyLoggerChild.mockReturnValue(mockLogger);
  });

  afterEach(() => {
    // Reset spies between tests
    spyWorker.mockReset();
    spyLoggerChild.mockReset();
    mock.clearAllMocks();
  });

  afterAll(() => {
    // Restore logger spy after all tests to avoid affecting other test files
    spyLoggerChild.mockRestore();
  });

  describe("successful processing", () => {
    it("should create worker, post message, call onSuccess, terminate, and log", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);

      const mockOnSuccess = mock((articleId: string) => {});

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onSuccess: mockOnSuccess,
      });

      await promise;

      // Verify worker was created with correct URL
      expect(spyWorker).toHaveBeenCalledTimes(1);
      const workerUrl = spyWorker.mock.calls[0]?.[0];
      expect(workerUrl).toBeDefined();
      expect(workerUrl.toString()).toContain("process-metadata.ts");

      // Verify message was posted with articleId
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(1);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        articleId: "test-123",
      });

      // Verify child logger was created with correct context
      expect(spyLoggerChild).toHaveBeenCalledWith({
        module: "worker",
        article: "test-123",
      });

      // Simulate worker success
      if (mockWorkerInstance.onmessage) {
        mockWorkerInstance.onmessage(
          new MessageEvent("message", {
            data: { success: true, articleId: "test-123" },
          }),
        );
      }

      // Wait for async event handler to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify onSuccess callback was called
      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      expect(mockOnSuccess).toHaveBeenCalledWith("test-123");

      // Verify worker was terminated
      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);

      // Verify info logs were called
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe("failed processing (via onmessage)", () => {
    it("should call onFailure with error, terminate worker, and log error", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);

      const mockOnFailure = mock((articleId: string, error?: unknown) => {});

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      await promise;

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

      // Wait for async event handler to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify onFailure was called with error message
      expect(mockOnFailure).toHaveBeenCalledTimes(1);
      expect(mockOnFailure).toHaveBeenCalledWith(
        "test-123",
        "Processing failed",
      );

      // Verify worker was terminated
      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("worker error event (onerror)", () => {
    it("should call onFailure with error, terminate worker, and log error", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);

      const mockOnFailure = mock((articleId: string, error?: unknown) => {});

      const promise = spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      await promise;

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

      // Wait for async event handler to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify onFailure was called with error
      expect(mockOnFailure).toHaveBeenCalledTimes(1);
      const callArgs = mockOnFailure.mock.calls[0];
      expect(callArgs?.[0]).toBe("test-123");
      expect(callArgs?.[1]).toBeInstanceOf(Error);
      expect((callArgs?.[1] as Error).message).toBe("Out of memory");

      // Verify worker was terminated
      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("worker creation failure", () => {
    it("should catch errors, call onFailure, and log without terminating", async () => {
      spyWorker.mockImplementation(() => {
        throw new Error("Failed to create worker");
      });

      const mockOnFailure = mock((articleId: string, error?: unknown) => {});

      await spawnArticleWorker({
        articleId: "test-123",
        onFailure: mockOnFailure,
      });

      // Verify onFailure was called with error
      expect(mockOnFailure).toHaveBeenCalledTimes(1);
      expect(mockOnFailure).toHaveBeenCalledWith(
        "test-123",
        expect.objectContaining({
          message: "Failed to create worker",
        }),
      );

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("callback error handling", () => {
    it("should catch onSuccess errors and log warning without throwing", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);

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

      // Verify warning was logged
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should catch onFailure errors and log warning without throwing", async () => {
      const mockWorkerInstance = {
        postMessage: mock(() => {}),
        terminate: mock(() => {}),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
      };

      spyWorker.mockImplementation(() => mockWorkerInstance);

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

      // Verify warning was logged
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
