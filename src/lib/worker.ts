export interface WorkerResult {
  success: boolean;
  articleId: string;
  error?: string;
}

export interface SpawnArticleWorkerParams {
  articleId: string;
  onSuccess?: (articleId: string) => void | Promise<void>;
  onFailure?: (articleId: string, error?: string) => void | Promise<void>;
}

export async function spawnArticleWorker({
  articleId,
  onSuccess,
  onFailure,
}: SpawnArticleWorkerParams): Promise<void> {
  // Fire and forget - don't await
  try {
    console.log(`[Worker Spawner] Creating worker for article ${articleId}`);
    const worker = new Worker(
      new URL("../workers/process-metadata.ts", import.meta.url),
    );

    // Send article ID to worker
    console.log(`[Worker Spawner] Posting message to worker: ${articleId}`);
    worker.postMessage({ articleId });

    // Handle worker response
    worker.onmessage = async (event: MessageEvent<WorkerResult>) => {
      const { success, articleId: processedId, error } = event.data;

      if (success) {
        console.log(
          `[Worker Spawner] Article processed successfully: ${processedId}`,
        );

        // Call success callback if provided
        if (onSuccess) {
          console.log(
            `[Worker Spawner] Calling onSuccess callback for ${processedId}`,
          );
          try {
            await onSuccess(processedId);
          } catch (err) {
            console.error(
              `[Worker Spawner] Error in onSuccess callback for ${processedId}:`,
              err,
            );
          }
        }
      } else {
        console.error(
          `[Worker Spawner] Article processing failed: ${processedId}`,
          error,
        );

        // Call failure callback if provided
        if (onFailure) {
          console.log(
            `[Worker Spawner] Calling onFailure callback for ${processedId}`,
          );
          try {
            await onFailure(processedId, error);
          } catch (err) {
            console.error(
              `[Worker Spawner] Error in onFailure callback for ${processedId}:`,
              err,
            );
          }
        }
      }

      // Terminate worker
      console.log(`[Worker Spawner] Terminating worker for ${processedId}`);
      worker.terminate();
    };

    // Handle worker errors
    worker.onerror = async (error) => {
      console.error(
        `[Worker Spawner] Worker error for article ${articleId}:`,
        error,
      );

      // Call failure callback if provided
      if (onFailure) {
        console.log(
          `[Worker Spawner] Calling onFailure callback for ${articleId}`,
        );
        try {
          await onFailure(articleId, error.message);
        } catch (err) {
          console.error(
            `[Worker Spawner] Error in onFailure callback for ${articleId}:`,
            err,
          );
        }
      }

      console.log(`[Worker Spawner] Terminating worker for ${articleId}`);
      worker.terminate();
    };
  } catch (error) {
    console.error(
      `[Worker Spawner] Failed to spawn worker for article ${articleId}:`,
      error,
    );

    // Call failure callback if provided
    if (onFailure) {
      console.log(
        `[Worker Spawner] Calling onFailure callback for ${articleId}`,
      );
      try {
        await onFailure(
          articleId,
          error instanceof Error ? error.message : String(error),
        );
      } catch (err) {
        console.error(
          `[Worker Spawner] Error in onFailure callback for ${articleId}:`,
          err,
        );
      }
    }
  }
}
