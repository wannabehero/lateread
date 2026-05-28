import type { Job } from "bunline";
import type { Article } from "../db/types";
import { config } from "../lib/config";
import { contentCache } from "../lib/content-cache";
import { getLLMProvider, isLLMAvailable } from "../lib/llm";
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
import { getAllowedFeaturesForUser } from "../services/subscription.service";
import { getOrGenerateSummary } from "../services/summaries.service";
import { getOrCreateTag, getUserTags } from "../services/tags.service";

export async function processArticleJob(job: Job<ArticleJobData>) {
  const { articleId } = job.data;

  const logger = defaultLogger.child({
    module: "article-worker",
    article: articleId,
    jobId: job.id,
    attempt: job.attempts,
  });

  logger.info("Worker started processing");

  logger.info("Fetching article from database");
  const article = await getArticleById(articleId);
  logger.info("Article found", { article: articleId, url: article.url });

  if (article.status === "completed") {
    logger.info("Article already completed, skipping");
    return;
  }

  logger.info("Updating status to processing", {
    attempt: article.processingAttempts + 1,
  });
  await updateArticleProcessing({
    id: articleId,
    status: "processing",
    processingAttempts: article.processingAttempts + 1,
  });

  const timeoutMs = config.PROCESSING_TIMEOUT_SECONDS * 1000;
  logger.info("Starting article processing with timeout", { timeoutMs });

  try {
    await withTimeout(
      processArticle(article, logger),
      timeoutMs,
      "Processing timeout",
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await updateArticleProcessing({
      id: articleId,
      status: "failed",
      lastError: errorMessage,
    });

    throw error;
  }
}

async function processArticle(article: Article, logger: Logger) {
  let htmlContent = await contentCache.get(article.userId, article.id);
  let textContent: string;
  let metadata: {
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
  };

  if (htmlContent) {
    textContent = htmlContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    logger.info("Extracted text from cached content", {
      length: textContent.length,
    });

    metadata = {
      title: article.title,
      description: article.description,
      imageUrl: article.imageUrl,
      siteName: article.siteName,
    };
  } else {
    logger.info("Fetching content", { url: article.url });
    const extracted = await extractCleanContent(article.url);

    if (!extracted.textContent || !extracted.content) {
      logger.warn("Failed to extract content", { url: article.url });
      throw new Error("Failed to extract content from URL");
    }

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

  const llmProvider = getLLMProvider();

  const existingTags = (await getUserTags(article.userId)).map((t) => t.name);
  logger.info("Found existing tags", { count: existingTags.length });

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
  const tags = tagPromises
    .filter((p) => p.status === "fulfilled")
    .map((p) => p.value);

  const readingStats = calculateReadingStats(htmlContent);
  logger.info("Calculated reading stats", {
    wordCount: readingStats.wordCount,
    readingTimeSeconds: readingStats.readingTimeSeconds,
  });

  if (!(await contentCache.exists(article.userId, article.id))) {
    await contentCache.set(article.userId, article.id, htmlContent);
    logger.info("Content cached successfully");
  } else {
    logger.info("Content already cached, skipping");
  }

  await updateArticleCompleted({
    id: article.id,
    tags,
    metadata,
    language,
    wordCount: readingStats.wordCount,
    readingTimeSeconds: readingStats.readingTimeSeconds,
  });

  logger.info("Article processing completed successfully");

  await maybeGenerateSummary(article, language, logger);
}

export async function maybeGenerateSummary(
  article: Article,
  language: string | null,
  logger: Logger,
) {
  if (!isLLMAvailable()) {
    return;
  }

  const features = await getAllowedFeaturesForUser(article.userId);
  if (!features.summary) {
    return;
  }

  try {
    logger.info("Generating summary for subscriber");
    await getOrGenerateSummary(
      article.userId,
      article.id,
      article.url,
      language,
    );
    logger.info("Summary generated successfully");
  } catch (error) {
    logger.warn("Summary generation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
