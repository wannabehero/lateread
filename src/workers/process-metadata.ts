import { and, eq, sql } from "drizzle-orm";
import { articles, articleTags, tags } from "../db/schema";
import { config } from "../lib/config";
import { contentCache } from "../lib/content-cache";
import { db } from "../lib/db";
import { getLLMProvider } from "../lib/llm";
import { extractCleanContent } from "../lib/readability";

self.onmessage = async (event: MessageEvent) => {
  const { articleId } = event.data;
  console.log(`[Worker ${articleId}] Started processing`);

  try {
    // Step 1: Fetch article from database
    console.log(`[Worker ${articleId}] Fetching article from database`);
    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      throw new Error(`Article not found: ${articleId}`);
    }

    console.log(`[Worker ${articleId}] Article found: ${article.url}`);

    // Early exit if already completed
    if (article.status === "completed") {
      console.log(`[Worker ${articleId}] Article already completed, exiting`);
      self.postMessage({ success: true, articleId });
      return;
    }

    // Step 2: Update status to 'processing', increment attempts
    console.log(
      `[Worker ${articleId}] Updating status to processing (attempt ${article.processingAttempts + 1})`,
    );
    await db
      .update(articles)
      .set({
        status: "processing",
        processingAttempts: article.processingAttempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleId));

    // Set up timeout
    const timeoutMs = config.PROCESSING_TIMEOUT_SECONDS * 1000;
    console.log(`[Worker ${articleId}] Timeout set to ${timeoutMs}ms`);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Processing timeout")), timeoutMs),
    );

    // Process article with timeout
    console.log(`[Worker ${articleId}] Starting article processing`);
    await Promise.race([processArticle(article), timeoutPromise]);

    // Step 9: Post success message
    console.log(`[Worker ${articleId}] Processing completed successfully`);
    self.postMessage({ success: true, articleId });
  } catch (error) {
    // Error handling
    console.error(`[Worker ${articleId}] Processing failed:`, error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    try {
      await db
        .update(articles)
        .set({
          status: "failed",
          lastError: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, articleId));
    } catch (dbError) {
      console.error("Failed to update article status:", dbError);
    }

    self.postMessage({
      success: false,
      articleId,
      error: errorMessage,
    });
  }
};

async function processArticle(article: typeof articles.$inferSelect) {
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
    // Content already cached (long Telegram message)
    console.log(
      `[Worker ${article.id}] Content already cached, skipping fetch`,
    );

    // Extract text from cached HTML for LLM
    textContent = htmlContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    console.log(
      `[Worker ${article.id}] Extracted text from cached content: ${textContent.length} chars`,
    );

    // Use existing metadata from article record
    metadata = {
      title: article.title,
      description: article.description,
      imageUrl: article.imageUrl,
      siteName: article.siteName,
    };
  } else {
    // Fetch URL content (regular article)
    console.log(`[Worker ${article.id}] Fetching content from: ${article.url}`);
    const extracted = await extractCleanContent(article.url);

    if (!extracted.textContent || !extracted.content) {
      console.error(
        `[Worker ${article.id}] Failed to extract content from ${article.url}`,
      );
      return;
    }

    console.log(
      `[Worker ${article.id}] Content extracted: ${extracted.textContent.length} chars`,
    );

    // Step 4: Metadata already extracted by readability wrapper
    console.log(
      `[Worker ${article.id}] Metadata: title="${extracted.title}", description="${extracted.description?.substring(0, 50)}..."`,
    );

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
  console.log(`[Worker ${article.id}] Loading LLM provider`);
  const llmProvider = getLLMProvider();

  // Load user's existing tags
  console.log(`[Worker ${article.id}] Loading user's existing tags`);
  const existingTagRecords = await db
    .select()
    .from(tags)
    .where(eq(tags.userId, article.userId));

  const existingTagNames = existingTagRecords.map((t) => t.name);
  console.log(
    `[Worker ${article.id}] Found ${existingTagNames.length} existing tags`,
  );

  // Call LLM to extract tags and detect language
  console.log(
    `[Worker ${article.id}] Calling LLM for tag extraction and language detection`,
  );
  const { tags: extractedTags, language } = await llmProvider.extractTags(
    textContent,
    existingTagNames,
  );

  console.log(
    `[Worker ${article.id}] LLM extracted ${extractedTags.length} tags: ${extractedTags.join(", ")}, language: ${language}`,
  );

  // Process tags: create new ones or reuse existing
  console.log(`[Worker ${article.id}] Processing tags`);
  const tagIds: string[] = [];

  for (const tagName of extractedTags) {
    const normalizedTagName = tagName.toLowerCase();

    // Check if tag exists (case-insensitive)
    const [existingTag] = await db
      .select()
      .from(tags)
      .where(
        and(
          eq(tags.userId, article.userId),
          sql`lower(${tags.name}) = ${normalizedTagName}`,
        ),
      )
      .limit(1);

    if (existingTag) {
      console.log(
        `[Worker ${article.id}] Reusing existing tag: ${normalizedTagName}`,
      );
      tagIds.push(existingTag.id);
    } else {
      console.log(
        `[Worker ${article.id}] Creating new tag: ${normalizedTagName}`,
      );
      // Create new tag
      const [newTag] = await db
        .insert(tags)
        .values({
          userId: article.userId,
          name: normalizedTagName,
          autoGenerated: true,
        })
        .returning();

      if (newTag) {
        tagIds.push(newTag.id);
      }
    }
  }

  console.log(`[Worker ${article.id}] Processed ${tagIds.length} tags`);

  // Step 6: Cache clean HTML content (if not already cached)
  if (!(await contentCache.exists(article.userId, article.id))) {
    console.log(`[Worker ${article.id}] Caching content to filesystem`);
    await contentCache.set(article.userId, article.id, htmlContent);
    console.log(`[Worker ${article.id}] Content cached successfully`);
  } else {
    console.log(`[Worker ${article.id}] Content already cached, skipping`);
  }

  // Step 7: Update database in transaction
  console.log(`[Worker ${article.id}] Updating database (transaction)`);
  await db.transaction(async (tx) => {
    // Update article metadata
    await tx
      .update(articles)
      .set({
        title: metadata.title,
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        siteName: metadata.siteName,
        language: language,
        status: "completed",
        processedAt: new Date(),
        updatedAt: new Date(),
        lastError: null,
      })
      .where(eq(articles.id, article.id));

    // Delete existing article-tag associations (in case of retry)
    await tx.delete(articleTags).where(eq(articleTags.articleId, article.id));

    // Insert new article-tag associations
    if (tagIds.length > 0) {
      await tx.insert(articleTags).values(
        tagIds.map((tagId) => ({
          articleId: article.id,
          tagId,
        })),
      );
    }
  });

  console.log(`[Worker ${article.id}] Database updated successfully`);
}
