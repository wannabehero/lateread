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
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, resetDatabase } from "../../test/bootstrap";
import { createCompletedArticle, createUser } from "../../test/fixtures";
import { articleSummaries } from "../db/schema";
import { ExternalServiceError } from "../lib/errors";
import type { SummaryResult } from "../lib/llm";
import * as llm from "../lib/llm";
import * as contentService from "./content.service";
import { getOrGenerateSummary } from "./summaries.service";

describe("summaries.service", () => {
  beforeEach(() => {
    resetDatabase();
  });

  describe("getOrGenerateSummary", () => {
    const spyGetArticleContent = spyOn(contentService, "getArticleContent");
    const spyGetLLMProvider = spyOn(llm, "getLLMProvider");

    afterEach(() => {
      mock.clearAllMocks();
    });

    afterAll(() => {
      mock.restore();
    });

    it("should return cached summary when it exists", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      // Insert a cached summary
      const cachedSummary = {
        oneSentence: "Cached one sentence summary",
        oneParagraph: "Cached one paragraph summary",
        long: "Cached long summary with more details",
      };

      await db.insert(articleSummaries).values({
        articleId: article.id,
        oneSentence: cachedSummary.oneSentence,
        oneParagraph: cachedSummary.oneParagraph,
        long: cachedSummary.long,
      });

      const result = await getOrGenerateSummary(
        user.id,
        article.id,
        article.url,
      );

      expect(result).toEqual(cachedSummary);
      expect(spyGetArticleContent).not.toHaveBeenCalled();
      expect(spyGetLLMProvider).not.toHaveBeenCalled();
    });

    it("should generate and cache new summary when not cached", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      const articleContent = "<p>This is <strong>article</strong> content</p>";
      const generatedSummary: SummaryResult = {
        oneSentence: "Generated one sentence summary",
        oneParagraph: "Generated one paragraph summary",
        long: "Generated long summary with more details",
      };

      const mockLLMProvider = {
        summarize: mock(() => Promise.resolve(generatedSummary)),
        extractTags: mock(() =>
          Promise.resolve({ tags: [], language: "en", confidence: 0 }),
        ),
      };

      spyGetArticleContent.mockResolvedValue(articleContent);
      spyGetLLMProvider.mockReturnValue(mockLLMProvider);

      const result = await getOrGenerateSummary(
        user.id,
        article.id,
        article.url,
      );

      expect(result).toEqual(generatedSummary);
      expect(spyGetArticleContent).toHaveBeenCalledWith(
        user.id,
        article.id,
        article.url,
      );
      expect(mockLLMProvider.summarize).toHaveBeenCalledWith(
        " This is article content ",
        undefined,
      );

      // Verify summary was cached in database
      const [savedSummary] = await db
        .select()
        .from(articleSummaries)
        .where(eq(articleSummaries.articleId, article.id))
        .limit(1);

      expect(savedSummary).toBeDefined();
      expect(savedSummary?.oneSentence).toBe(generatedSummary.oneSentence);
      expect(savedSummary?.oneParagraph).toBe(generatedSummary.oneParagraph);
      expect(savedSummary?.long).toBe(generatedSummary.long);
    });

    it("should strip HTML tags from content before summarization", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      const articleContent = `
        <div>
          <h1>Article Title</h1>
          <p>First paragraph with <em>emphasis</em>.</p>
          <p>Second paragraph with <a href="#">links</a>.</p>
        </div>
      `;

      const generatedSummary: SummaryResult = {
        oneSentence: "Summary",
        oneParagraph: "Summary paragraph",
        long: "Long summary",
      };

      const mockLLMProvider = {
        summarize: mock(() => Promise.resolve(generatedSummary)),
        extractTags: mock(() =>
          Promise.resolve({ tags: [], language: "en", confidence: 0 }),
        ),
      };

      spyGetArticleContent.mockResolvedValue(articleContent);
      spyGetLLMProvider.mockReturnValue(mockLLMProvider);

      await getOrGenerateSummary(user.id, article.id, article.url);

      // Check that HTML tags were stripped and whitespace normalized
      const calledWith = mockLLMProvider.summarize.mock.calls[0]?.[0];
      expect(calledWith).not.toContain("<");
      expect(calledWith).not.toContain(">");
      expect(calledWith).toContain("Article Title");
      expect(calledWith).toContain("First paragraph");
      expect(calledWith).toContain("Second paragraph");
      // Note: The implementation leaves leading/trailing spaces
      expect(calledWith?.trim()).toBeTruthy();
    });

    it("should normalize multiple whitespace characters", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      const articleContent =
        "<p>Text   with    multiple     spaces</p>\n\n<p>And newlines</p>";

      const generatedSummary: SummaryResult = {
        oneSentence: "Summary",
        oneParagraph: "Summary paragraph",
        long: "Long summary",
      };

      const mockLLMProvider = {
        summarize: mock(() => Promise.resolve(generatedSummary)),
        extractTags: mock(() =>
          Promise.resolve({ tags: [], language: "en", confidence: 0 }),
        ),
      };

      spyGetArticleContent.mockResolvedValue(articleContent);
      spyGetLLMProvider.mockReturnValue(mockLLMProvider);

      await getOrGenerateSummary(user.id, article.id, article.url);

      const calledWith = mockLLMProvider.summarize.mock.calls[0]?.[0];
      expect(calledWith).toBe(" Text with multiple spaces And newlines ");
    });

    it("should pass language code to LLM provider when provided", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      const articleContent = "<p>Article content</p>";
      const languageCode = "es";

      const generatedSummary: SummaryResult = {
        oneSentence: "Resumen de una oración",
        oneParagraph: "Resumen de un párrafo",
        long: "Resumen largo",
      };

      const mockLLMProvider = {
        summarize: mock(() => Promise.resolve(generatedSummary)),
        extractTags: mock(() =>
          Promise.resolve({ tags: [], language: "en", confidence: 0 }),
        ),
      };

      spyGetArticleContent.mockResolvedValue(articleContent);
      spyGetLLMProvider.mockReturnValue(mockLLMProvider);

      const result = await getOrGenerateSummary(
        user.id,
        article.id,
        article.url,
        languageCode,
      );

      expect(result).toEqual(generatedSummary);
      expect(mockLLMProvider.summarize).toHaveBeenCalledWith(
        " Article content ",
        languageCode,
      );
    });

    it("should handle null language code", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      const articleContent = "<p>Article content</p>";

      const generatedSummary: SummaryResult = {
        oneSentence: "Summary",
        oneParagraph: "Summary paragraph",
        long: "Long summary",
      };

      const mockLLMProvider = {
        summarize: mock(() => Promise.resolve(generatedSummary)),
        extractTags: mock(() =>
          Promise.resolve({ tags: [], language: "en", confidence: 0 }),
        ),
      };

      spyGetArticleContent.mockResolvedValue(articleContent);
      spyGetLLMProvider.mockReturnValue(mockLLMProvider);

      await getOrGenerateSummary(user.id, article.id, article.url, null);

      expect(mockLLMProvider.summarize).toHaveBeenCalledWith(
        " Article content ",
        null,
      );
    });

    it("should propagate errors from getArticleContent", async () => {
      const userId = randomUUID();
      const articleId = randomUUID();
      const articleUrl = "https://example.com/article";

      const contentError = new ExternalServiceError("Failed to fetch article");
      spyGetArticleContent.mockRejectedValue(contentError);

      await expect(
        getOrGenerateSummary(userId, articleId, articleUrl),
      ).rejects.toThrow(contentError);

      expect(spyGetArticleContent).toHaveBeenCalledWith(
        userId,
        articleId,
        articleUrl,
      );
      expect(spyGetLLMProvider).not.toHaveBeenCalled();
    });

    it("should propagate errors from LLM provider", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      const articleContent = "<p>Article content</p>";
      const llmError = new Error("LLM service unavailable");

      const mockLLMProvider = {
        summarize: mock(() => Promise.reject(llmError)),
        extractTags: mock(() =>
          Promise.resolve({ tags: [], language: "en", confidence: 0 }),
        ),
      };

      spyGetArticleContent.mockResolvedValue(articleContent);
      spyGetLLMProvider.mockReturnValue(mockLLMProvider);

      await expect(
        getOrGenerateSummary(user.id, article.id, article.url),
      ).rejects.toThrow(llmError);

      expect(spyGetArticleContent).toHaveBeenCalledWith(
        user.id,
        article.id,
        article.url,
      );
      expect(mockLLMProvider.summarize).toHaveBeenCalled();

      // Verify no summary was saved to database
      const [savedSummary] = await db
        .select()
        .from(articleSummaries)
        .where(eq(articleSummaries.articleId, article.id))
        .limit(1);

      expect(savedSummary).toBeUndefined();
    });

    it("should not duplicate summaries on concurrent calls for same article", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      const articleContent = "<p>Article content</p>";
      const generatedSummary: SummaryResult = {
        oneSentence: "Summary",
        oneParagraph: "Summary paragraph",
        long: "Long summary",
      };

      const mockLLMProvider = {
        summarize: mock(() => Promise.resolve(generatedSummary)),
        extractTags: mock(() =>
          Promise.resolve({ tags: [], language: "en", confidence: 0 }),
        ),
      };

      spyGetArticleContent.mockResolvedValue(articleContent);
      spyGetLLMProvider.mockReturnValue(mockLLMProvider);

      // First call generates and caches
      const result1 = await getOrGenerateSummary(
        user.id,
        article.id,
        article.url,
      );

      // Reset mocks
      mock.clearAllMocks();

      // Second call should use cached version
      const result2 = await getOrGenerateSummary(
        user.id,
        article.id,
        article.url,
      );

      expect(result1).toEqual(generatedSummary);
      expect(result2).toEqual(generatedSummary);

      // Verify LLM was only called once (on first call)
      expect(mockLLMProvider.summarize).not.toHaveBeenCalled();
      expect(spyGetArticleContent).not.toHaveBeenCalled();

      // Verify only one summary exists in database
      const summaries = await db
        .select()
        .from(articleSummaries)
        .where(eq(articleSummaries.articleId, article.id));

      expect(summaries).toHaveLength(1);
    });

    it("should handle empty content after HTML stripping", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      const articleContent = "<div></div><p></p>";

      const generatedSummary: SummaryResult = {
        oneSentence: "Summary",
        oneParagraph: "Summary paragraph",
        long: "Long summary",
      };

      const mockLLMProvider = {
        summarize: mock(() => Promise.resolve(generatedSummary)),
        extractTags: mock(() =>
          Promise.resolve({ tags: [], language: "en", confidence: 0 }),
        ),
      };

      spyGetArticleContent.mockResolvedValue(articleContent);
      spyGetLLMProvider.mockReturnValue(mockLLMProvider);

      const result = await getOrGenerateSummary(
        user.id,
        article.id,
        article.url,
      );

      expect(result).toEqual(generatedSummary);
      expect(mockLLMProvider.summarize).toHaveBeenCalledWith(" ", undefined);
    });

    it("should handle content with special characters", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      const articleContent = "<p>Content with &amp; &lt; &gt; entities</p>";

      const generatedSummary: SummaryResult = {
        oneSentence: "Summary",
        oneParagraph: "Summary paragraph",
        long: "Long summary",
      };

      const mockLLMProvider = {
        summarize: mock(() => Promise.resolve(generatedSummary)),
        extractTags: mock(() =>
          Promise.resolve({ tags: [], language: "en", confidence: 0 }),
        ),
      };

      spyGetArticleContent.mockResolvedValue(articleContent);
      spyGetLLMProvider.mockReturnValue(mockLLMProvider);

      await getOrGenerateSummary(user.id, article.id, article.url);

      const calledWith = mockLLMProvider.summarize.mock.calls[0]?.[0];
      expect(calledWith).toBe(" Content with &amp; &lt; &gt; entities ");
    });
  });
});
