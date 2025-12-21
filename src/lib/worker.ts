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
    const worker = new Worker(
      new URL("../workers/process-metadata.ts", import.meta.url),
    );

    // Send article ID to worker
    worker.postMessage({ articleId });

    // Handle worker response
    worker.onmessage = async (event: MessageEvent<WorkerResult>) => {
      const { success, articleId: processedId, error } = event.data;

      if (success) {
        console.log(`Article processed successfully: ${processedId}`);

        // Call success callback if provided
        if (onSuccess) {
          try {
            await onSuccess(processedId);
          } catch (err) {
            console.error("Error in onSuccess callback:", err);
          }
        }
      } else {
        console.error(`Article processing failed: ${processedId}`, error);

        // Call failure callback if provided
        if (onFailure) {
          try {
            await onFailure(processedId, error);
          } catch (err) {
            console.error("Error in onFailure callback:", err);
          }
        }
      }

      // Terminate worker
      worker.terminate();
    };

    // Handle worker errors
    worker.onerror = async (error) => {
      console.error(`Worker error for article ${articleId}:`, error);

      // Call failure callback if provided
      if (onFailure) {
        try {
          await onFailure(articleId, error.message);
        } catch (err) {
          console.error("Error in onFailure callback:", err);
        }
      }

      worker.terminate();
    };
  } catch (error) {
    console.error(`Failed to spawn worker for article ${articleId}:`, error);

    // Call failure callback if provided
    if (onFailure) {
      try {
        await onFailure(
          articleId,
          error instanceof Error ? error.message : String(error),
        );
      } catch (err) {
        console.error("Error in onFailure callback:", err);
      }
    }
  }
}
