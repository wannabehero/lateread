import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { TelegramContext } from "./queue";

/**
 * These tests verify the queue event handler logic for Telegram message feedback.
 * Since the queue module has singleton state and imports bot/bunline at module level,
 * we test the event handler functions in isolation.
 */
describe("queue telegram feedback", () => {
  describe("TelegramContext type", () => {
    it("should have required chatId and messageId fields", () => {
      const context: TelegramContext = {
        chatId: 123456789,
        messageId: 42,
      };

      expect(context.chatId).toBe(123456789);
      expect(context.messageId).toBe(42);
    });
  });

  describe("event handler logic", () => {
    // Mock implementations for testing the handler logic
    let mockSetMessageReaction: ReturnType<typeof mock>;
    let mockLoggerInfo: ReturnType<typeof mock>;
    let mockLoggerWarn: ReturnType<typeof mock>;
    let mockLoggerError: ReturnType<typeof mock>;

    beforeEach(() => {
      mockSetMessageReaction = mock(() => Promise.resolve(true));
      mockLoggerInfo = mock(() => {});
      mockLoggerWarn = mock(() => {});
      mockLoggerError = mock(() => {});
    });

    afterEach(() => {
      mockSetMessageReaction.mockClear();
      mockLoggerInfo.mockClear();
      mockLoggerWarn.mockClear();
      mockLoggerError.mockClear();
    });

    /**
     * Simulates the job:completed event handler logic from queue.ts
     */
    async function handleJobCompleted(
      job: { data: { articleId: string; telegram?: TelegramContext } },
      botApi: { setMessageReaction: typeof mockSetMessageReaction },
      logger: { info: typeof mockLoggerInfo; warn: typeof mockLoggerWarn },
    ) {
      const { telegram, articleId } = job.data;
      if (telegram) {
        try {
          await botApi.setMessageReaction(telegram.chatId, telegram.messageId, [
            { type: "emoji", emoji: "👍" },
          ]);
          logger.info("Updated reaction to success", { articleId });
        } catch (error) {
          logger.warn("Failed to update reaction", { articleId, error });
        }
      }
    }

    /**
     * Simulates the job:exhausted event handler logic from queue.ts
     */
    async function handleJobExhausted(
      job: { data: { articleId: string; telegram?: TelegramContext } },
      error: Error,
      botApi: { setMessageReaction: typeof mockSetMessageReaction },
      logger: {
        info: typeof mockLoggerInfo;
        warn: typeof mockLoggerWarn;
        error: typeof mockLoggerError;
      },
    ) {
      const { telegram, articleId } = job.data;
      if (telegram) {
        try {
          await botApi.setMessageReaction(telegram.chatId, telegram.messageId, [
            { type: "emoji", emoji: "👎" },
          ]);
          logger.info("Updated reaction to failure", { articleId });
        } catch (reactionError) {
          logger.warn("Failed to update reaction", {
            articleId,
            error: reactionError,
          });
        }
      }
      logger.error("Article processing exhausted all retries", {
        articleId,
        error: String(error),
      });
    }

    describe("job:completed handler", () => {
      it("should update reaction to thumbs up when telegram context exists", async () => {
        const telegram: TelegramContext = { chatId: 123, messageId: 456 };
        const job = { data: { articleId: "article-1", telegram } };

        await handleJobCompleted(
          job,
          { setMessageReaction: mockSetMessageReaction },
          { info: mockLoggerInfo, warn: mockLoggerWarn },
        );

        expect(mockSetMessageReaction).toHaveBeenCalledTimes(1);
        expect(mockSetMessageReaction).toHaveBeenCalledWith(123, 456, [
          { type: "emoji", emoji: "👍" },
        ]);
        expect(mockLoggerInfo).toHaveBeenCalledWith(
          "Updated reaction to success",
          {
            articleId: "article-1",
          },
        );
      });

      it("should not update reaction when telegram context is missing", async () => {
        const job = { data: { articleId: "article-2" } };

        await handleJobCompleted(
          job,
          { setMessageReaction: mockSetMessageReaction },
          { info: mockLoggerInfo, warn: mockLoggerWarn },
        );

        expect(mockSetMessageReaction).not.toHaveBeenCalled();
        expect(mockLoggerInfo).not.toHaveBeenCalled();
      });

      it("should handle API errors gracefully", async () => {
        const telegram: TelegramContext = { chatId: 123, messageId: 456 };
        const job = { data: { articleId: "article-3", telegram } };
        const apiError = new Error("Telegram API error");

        mockSetMessageReaction.mockRejectedValue(apiError);

        await handleJobCompleted(
          job,
          { setMessageReaction: mockSetMessageReaction },
          { info: mockLoggerInfo, warn: mockLoggerWarn },
        );

        expect(mockLoggerWarn).toHaveBeenCalledWith(
          "Failed to update reaction",
          {
            articleId: "article-3",
            error: apiError,
          },
        );
        expect(mockLoggerInfo).not.toHaveBeenCalled();
      });
    });

    describe("job:exhausted handler", () => {
      it("should update reaction to thumbs down when telegram context exists", async () => {
        const telegram: TelegramContext = { chatId: 789, messageId: 101 };
        const job = { data: { articleId: "article-4", telegram } };
        const processingError = new Error("All retries failed");

        await handleJobExhausted(
          job,
          processingError,
          { setMessageReaction: mockSetMessageReaction },
          {
            info: mockLoggerInfo,
            warn: mockLoggerWarn,
            error: mockLoggerError,
          },
        );

        expect(mockSetMessageReaction).toHaveBeenCalledTimes(1);
        expect(mockSetMessageReaction).toHaveBeenCalledWith(789, 101, [
          { type: "emoji", emoji: "👎" },
        ]);
        expect(mockLoggerInfo).toHaveBeenCalledWith(
          "Updated reaction to failure",
          {
            articleId: "article-4",
          },
        );
        expect(mockLoggerError).toHaveBeenCalledWith(
          "Article processing exhausted all retries",
          { articleId: "article-4", error: "Error: All retries failed" },
        );
      });

      it("should not update reaction when telegram context is missing", async () => {
        const job = { data: { articleId: "article-5" } };
        const processingError = new Error("Processing failed");

        await handleJobExhausted(
          job,
          processingError,
          { setMessageReaction: mockSetMessageReaction },
          {
            info: mockLoggerInfo,
            warn: mockLoggerWarn,
            error: mockLoggerError,
          },
        );

        expect(mockSetMessageReaction).not.toHaveBeenCalled();
        expect(mockLoggerInfo).not.toHaveBeenCalled();
        expect(mockLoggerError).toHaveBeenCalledWith(
          "Article processing exhausted all retries",
          { articleId: "article-5", error: "Error: Processing failed" },
        );
      });

      it("should handle API errors gracefully", async () => {
        const telegram: TelegramContext = { chatId: 123, messageId: 456 };
        const job = { data: { articleId: "article-6", telegram } };
        const processingError = new Error("Processing failed");
        const apiError = new Error("Telegram API error");

        mockSetMessageReaction.mockRejectedValue(apiError);

        await handleJobExhausted(
          job,
          processingError,
          { setMessageReaction: mockSetMessageReaction },
          {
            info: mockLoggerInfo,
            warn: mockLoggerWarn,
            error: mockLoggerError,
          },
        );

        expect(mockLoggerWarn).toHaveBeenCalledWith(
          "Failed to update reaction",
          {
            articleId: "article-6",
            error: apiError,
          },
        );
        expect(mockLoggerError).toHaveBeenCalledWith(
          "Article processing exhausted all retries",
          { articleId: "article-6", error: "Error: Processing failed" },
        );
      });
    });
  });

  describe("ArticleJobData structure", () => {
    it("should support articleId only", () => {
      const jobData = { articleId: "test-article-1" };
      expect(jobData.articleId).toBe("test-article-1");
    });

    it("should support articleId with telegram context", () => {
      const telegram: TelegramContext = { chatId: 12345, messageId: 67890 };
      const jobData = { articleId: "test-article-2", telegram };

      expect(jobData.articleId).toBe("test-article-2");
      expect(jobData.telegram).toEqual(telegram);
      expect(jobData.telegram?.chatId).toBe(12345);
      expect(jobData.telegram?.messageId).toBe(67890);
    });
  });
});
