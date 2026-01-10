import bunline from "bunline";
import type { Article } from "../db/types";
import { config } from "../lib/config";
import { contentCache } from "../lib/content-cache";
import { getLLMProvider } from "../lib/llm";
import { defaultLogger, type Logger } from "../lib/logger";
import type { ArticleJobData } from "../lib/queue";
import { extractCleanContent } from "../lib/readability";
import { calculateReadingStats } from "../lib/reading-time";
import { withTimeout } from "../lib/timeout";
import {
  getArticleById,
  updateArticleCompleted,
  updateArticleProcessing,
} from "../services/articles.service";
import { getOrCreateTag, getUserTags } from "../services/tags.service";

bunline.setupThreadWorker<ArticleJobData>(async (job) => {
  const { articleId } = job.data;

  const logger = defaultLogger.child({
    module: "article-worker",
    article: articleId,
    jobId: job.id,
    attempt: job.attempts,
  });

  logger.info("Worker started processing");

  // Fetch article from database
  logger.info("Fetching article from database");
  const article = await getArticleById(articleId);
  logger.info("Article found", { article: articleId, url: article.url });

  // Early exit if already completed
  if (article.status === "completed") {
    logger.info("Article already completed, skipping");
    return;
  }

  // Update status to 'processing', increment attempts
  logger.info("Updating status to processing", {
    attempt: article.processingAttempts + 1,
  });
  await updateArticleProcessing({
    id: articleId,
    status: "processing",
    processingAttempts: article.processingAttempts + 1,
  });

  // Process article with timeout
  const timeoutMs = config.PROCESSING_TIMEOUT_SECONDS * 1000;
  logger.info("Starting article processing with timeout", { timeoutMs });

  try {
    await withTimeout(
      processArticle(article, logger),
      timeoutMs,
      "Processing timeout",
    );
  } catch (error) {
    // Update article status to failed
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await updateArticleProcessing({
      id: articleId,
      status: "failed",
      lastError: errorMessage,
    });

    // Re-throw to let bunline handle retries
    throw error;
  }
});

async function processArticle(article: Article, logger: Logger) {
  // Check if content is already cached (for Telegram long messages)
  let htmlContent = await contentCache.get(article.userId, article.id);
  let textContent: string;
  let metadata: {
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
  };

  if (htmlContent) {
    // Extract text from cached HTML for LLM
    textContent = htmlContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    logger.info("Extracted text from cached content", {
      length: textContent.length,
    });

    // Use existing metadata from article record
    metadata = {
      title: article.title,
      description: article.description,
      imageUrl: article.imageUrl,
      siteName: article.siteName,
    };
  } else {
    logger.info("Fetching content", {
      url: article.url,
    });
    const extracted = await extractCleanContent(article.url);

    if (!extracted.textContent || !extracted.content) {
      logger.warn("Failed to extract content", {
        url: article.url,
      });
      throw new Error("Failed to extract content from URL");
    }

    // Metadata already extracted by readability wrapper
    logger.info("Content extracted", {
      title: extracted.title,
      description: extracted.description?.substring(0, 32),
      imageUrl: extracted.imageUrl,
      siteName: extracted.siteName,
      length: extracted.textContent.length,
    });

    htmlContent = extracted.content;
    textContent = extracted.textContent;
    metadata = {
      title: extracted.title ?? null,
      description: extracted.description ?? null,
      imageUrl: extracted.imageUrl ?? null,
      siteName: extracted.siteName ?? null,
    };
  }

  // Generate tags using LLM
  const llmProvider = getLLMProvider();

  const existingTags = (await getUserTags(article.userId)).map((t) => t.name);
  logger.info("Found existing tags", {
    count: existingTags.length,
  });

  logger.info("Calling LLM for tag extraction and language detection");
  const { tags: extractedTags, language } = await llmProvider.extractTags(
    textContent,
    existingTags,
  );

  logger.info("LLM extracted tags and language", {
    tags: extractedTags,
    language,
  });

  const tagPromises = await Promise.allSettled(
    extractedTags.map((tag) => getOrCreateTag(article.userId, tag)),
  );
  // Ignoring failed promises intentionally
  const tags = tagPromises
    .filter((p) => p.status === "fulfilled")
    .map((p) => p.value);

  // Calculate reading statistics
  const readingStats = calculateReadingStats(htmlContent);
  logger.info("Calculated reading stats", {
    wordCount: readingStats.wordCount,
    readingTimeSeconds: readingStats.readingTimeSeconds,
  });

  // Cache clean HTML content (if not already cached)
  if (!(await contentCache.exists(article.userId, article.id))) {
    await contentCache.set(article.userId, article.id, htmlContent);
    logger.info("Content cached successfully");
  } else {
    logger.info("Content already cached, skipping");
  }

  // Update database
  await updateArticleCompleted({
    id: article.id,
    tags,
    metadata,
    language,
    wordCount: readingStats.wordCount,
    readingTimeSeconds: readingStats.readingTimeSeconds,
  });

  logger.info("Article processing completed successfully");
}
