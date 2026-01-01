import type { Article } from "../db/types";
import { config } from "../lib/config";
import { contentCache } from "../lib/content-cache";
import { getLLMProvider } from "../lib/llm";
import { defaultLogger, type Logger } from "../lib/logger";
import { extractCleanContent } from "../lib/readability";
import { withTimeout } from "../lib/timeout";
import {
  getArticleById,
  updateArticleCompleted,
  updateArticleProcessing,
} from "../services/articles.service";
import { getOrCreateTag, getUserTags } from "../services/tags.service";

self.onmessage = async (event: MessageEvent) => {
  const { articleId } = event.data;

  const logger = defaultLogger.child({
    module: "process-metadata",
    article: articleId,
  });

  logger.info("Worker started processing");

  try {
    // Step 1: Fetch article from database
    logger.info("Fetching article from database");
    const article = await getArticleById(articleId);
    logger.info("Article found", { article: articleId, url: article.url });

    // Early exit if already completed
    if (article.status === "completed") {
      logger.info("Article already completed, exiting");
      self.postMessage({ success: true, articleId });
      return;
    }

    // Step 2: Update status to 'processing', increment attempts
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
    logger.info("Starting article processing with timeout", {
      timeoutMs,
    });
    await withTimeout(
      processArticle(article, logger),
      timeoutMs,
      "Processing timeout",
    );

    // Step 9: Post success message
    self.postMessage({ success: true, articleId });
  } catch (error) {
    // Error handling
    logger.error("Processing failed", { error });

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await updateArticleProcessing({
      id: articleId,
      status: "failed",
      lastError: errorMessage,
    });

    self.postMessage({
      success: false,
      articleId,
      error: errorMessage,
    });
  }
};

async function processArticle(article: Article, logger: Logger) {
  // Step 3: Check if content is already cached (for Telegram long messages)
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
      return;
    }

    // Step 4: Metadata already extracted by readability wrapper
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

  // Step 5: Generate tags using LLM
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
    extractedTags.map((tag) => getOrCreateTag(tag, article.userId)),
  );
  // Ignoring failed promises intentionally
  const tags = tagPromises
    .filter((p) => p.status === "fulfilled")
    .map((p) => p.value);

  // Step 6: Cache clean HTML content (if not already cached)
  if (!(await contentCache.exists(article.userId, article.id))) {
    await contentCache.set(article.userId, article.id, htmlContent);
    logger.info("Content cached successfully");
  } else {
    logger.info("Content already cached, skipping");
  }

  // Step 7: Update database
  await updateArticleCompleted({
    id: article.id,
    tags,
    metadata,
    language,
  });
}
