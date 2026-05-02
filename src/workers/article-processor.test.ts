import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { eq } from "drizzle-orm";
import { db, resetDatabase } from "../../test/bootstrap";
import {
  createCompletedArticle,
  createNoopLogger,
  createSubscription,
  createUser,
} from "../../test/fixtures";
import { articleSummaries } from "../db/schema";
import * as llm from "../lib/llm";
import * as summariesService from "../services/summaries.service";
import { maybeGenerateSummary } from "./article-processor";

describe("article-processor", () => {
  describe("maybeGenerateSummary", () => {
    const spyIsLLMAvailable = spyOn(llm, "isLLMAvailable");
    const spyGetOrGenerateSummary = spyOn(
      summariesService,
      "getOrGenerateSummary",
    );

    beforeEach(() => {
      resetDatabase();
      spyIsLLMAvailable.mockReturnValue(true);
    });

    afterEach(() => {
      mock.clearAllMocks();
    });

    it("generates a summary when the user has a lite subscription", async () => {
      const user = await createUser(db);
      await createSubscription(db, user.id, { type: "lite" });
      const article = await createCompletedArticle(db, user.id, {
        language: "en",
      });

      spyGetOrGenerateSummary.mockResolvedValue({
        oneSentence: "One sentence.",
        oneParagraph: "One paragraph.",
      });

      await maybeGenerateSummary(article, "en", createNoopLogger());

      expect(spyGetOrGenerateSummary).toHaveBeenCalledWith(
        user.id,
        article.id,
        article.url,
        "en",
      );
    });

    it("skips when the user has no active subscription", async () => {
      const user = await createUser(db);
      const article = await createCompletedArticle(db, user.id);

      await maybeGenerateSummary(article, null, createNoopLogger());

      expect(spyGetOrGenerateSummary).not.toHaveBeenCalled();
    });

    it("skips when LLM is not configured", async () => {
      spyIsLLMAvailable.mockReturnValue(false);
      const user = await createUser(db);
      await createSubscription(db, user.id, { type: "full" });
      const article = await createCompletedArticle(db, user.id);

      await maybeGenerateSummary(article, "en", createNoopLogger());

      expect(spyGetOrGenerateSummary).not.toHaveBeenCalled();
    });

    it("swallows summary errors so the article stays completed", async () => {
      const user = await createUser(db);
      await createSubscription(db, user.id, { type: "lite" });
      const article = await createCompletedArticle(db, user.id);

      spyGetOrGenerateSummary.mockRejectedValue(new Error("LLM 500"));

      await expect(
        maybeGenerateSummary(article, "en", createNoopLogger()),
      ).resolves.toBeUndefined();

      const rows = await db
        .select()
        .from(articleSummaries)
        .where(eq(articleSummaries.articleId, article.id));
      expect(rows).toHaveLength(0);
    });
  });
});
