import { bot } from "../bot";

export interface WorkerResult {
  success: boolean;
  articleId: string;
  error?: string;
}

export interface SpawnArticleWorkerParams {
  articleId: string;
  telegramChatId?: number;
  telegramMessageId?: number;
}

export function spawnArticleWorker({
  articleId,
  telegramChatId,
  telegramMessageId,
}: SpawnArticleWorkerParams): void {
  // Fire and forget - don't await
  (async () => {
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

          // Update Telegram reaction to thumbs up
          if (telegramChatId && telegramMessageId) {
            try {
              await bot.api.setMessageReaction(
                telegramChatId,
                telegramMessageId,
                [{ type: "emoji", emoji: "👍" }],
              );
            } catch (err) {
              console.error("Failed to update Telegram reaction:", err);
            }
          }
        } else {
          console.error(`Article processing failed: ${processedId}`, error);

          // Update Telegram reaction to thumbs down
          if (telegramChatId && telegramMessageId) {
            try {
              await bot.api.setMessageReaction(
                telegramChatId,
                telegramMessageId,
                [{ type: "emoji", emoji: "👎" }],
              );
            } catch (err) {
              console.error("Failed to update Telegram reaction:", err);
            }
          }
        }

        // Terminate worker
        worker.terminate();
      };

      // Handle worker errors
      worker.onerror = (error) => {
        console.error(`Worker error for article ${articleId}:`, error);

        // Update Telegram reaction to thumbs down on worker error
        if (telegramChatId && telegramMessageId) {
          (async () => {
            try {
              await bot.api.setMessageReaction(
                telegramChatId,
                telegramMessageId,
                [{ type: "emoji", emoji: "👎" }],
              );
            } catch (err) {
              console.error("Failed to update Telegram reaction:", err);
            }
          })();
        }

        worker.terminate();
      };
    } catch (error) {
      console.error(`Failed to spawn worker for article ${articleId}:`, error);

      // Update Telegram reaction to thumbs down on spawn error
      if (telegramChatId && telegramMessageId) {
        try {
          await bot.api.setMessageReaction(telegramChatId, telegramMessageId, [
            { type: "emoji", emoji: "👎" },
          ]);
        } catch (err) {
          console.error("Failed to update Telegram reaction:", err);
        }
      }
    }
  })();
}

/**
 * NOTE: I don't like the coupling between the worker and the Telegram bot.
 */
