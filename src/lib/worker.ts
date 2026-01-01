import { defaultLogger } from "./logger";

export interface WorkerResult {
  success: boolean;
  articleId: string;
  error?: string;
}

export interface SpawnArticleWorkerParams {
  articleId: string;
  onSuccess?: (articleId: string) => void | Promise<void>;
  onFailure?: (articleId: string, error?: unknown) => void | Promise<void>;
}

export async function spawnArticleWorker({
  articleId,
  onSuccess,
  onFailure,
}: SpawnArticleWorkerParams): Promise<void> {
  const logger = defaultLogger.child({ module: "worker", article: articleId });

  const notifyFailure = async (error: unknown) => {
    if (onFailure) {
      logger.info("Calling onFailure callback");
      try {
        await onFailure(articleId, error);
      } catch (error) {
        logger.warn("Error in onFailure callback", { error });
      }
    }
  };

  const notifySuccess = async () => {
    if (onSuccess) {
      logger.info("Calling onSuccess callback");
      try {
        await onSuccess(articleId);
      } catch (error) {
        logger.warn("Error in onSuccess callback", { error });
      }
    }
  };

  try {
    logger.info("Creating worker");
    const worker = new Worker(
      new URL("../workers/process-metadata.ts", import.meta.url),
    );

    // Send article ID to worker
    logger.info("Posting message to worker");
    worker.postMessage({ articleId });

    // Handle worker response
    worker.onmessage = async (event: MessageEvent<WorkerResult>) => {
      const { success, error } = event.data;

      if (success) {
        logger.info("Article processed successfully");
        await notifySuccess();
      } else {
        logger.error("Article processing failed", { error });
        await notifyFailure(error);
      }

      logger.info("Terminating worker");
      worker.terminate();
    };

    // Handle worker errors
    worker.onerror = async (error) => {
      logger.error("Worker error", { error });
      await notifyFailure(error.error);

      logger.info("Terminating worker");
      worker.terminate();
    };
  } catch (error) {
    logger.error("Failed to spawn worker", { error });
    await notifyFailure(error);
  }
}
