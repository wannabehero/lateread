import type { AnthropicProvider } from "@ai-sdk/anthropic";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { config } from "./config";
import { ExternalServiceError } from "./errors";
import {
  SUMMARIZATION_SYSTEM_PROMPT,
  TAG_EXTRACTION_SYSTEM_PROMPT,
} from "./llm-prompts";
import { defaultLogger } from "./logger";

const logger = defaultLogger.child({ module: "llm" });

const tagExtractionSchema = z.object({
  tags: z.array(z.string()),
  language: z.string(),
  confidence: z.number(),
});

type TagExtractionResult = z.infer<typeof tagExtractionSchema>;

const summarySchema = z.object({
  oneSentence: z.string().min(1),
  oneParagraph: z.string().min(1),
  long: z.string().min(1),
});

export type SummaryResult = z.infer<typeof summarySchema>;

interface LLMProvider {
  extractTags(
    content: string,
    existingTags: string[],
  ): Promise<TagExtractionResult>;
  summarize(
    content: string,
    languageCode?: string | null,
  ): Promise<SummaryResult>;
}

export class ClaudeProvider implements LLMProvider {
  private anthropic: AnthropicProvider;
  private taggingModel = "claude-haiku-4-5";
  private summaryModel = "claude-sonnet-4-6";

  constructor(apiKey: string) {
    this.anthropic = createAnthropic({ apiKey });
  }

  async extractTags(
    content: string,
    existingTags: string[],
  ): Promise<TagExtractionResult> {
    try {
      // Truncate content to ~10k words (roughly 40k characters)
      const truncatedContent = content.substring(0, 40000);

      const existingTagsText =
        existingTags.length > 0
          ? `\nExisting tags to consider reusing:\n${existingTags.join(", ")}\n`
          : "";

      const userPrompt = `Analyze this article and extract 5-10 relevant tags.
${existingTagsText}
Article content:
${truncatedContent}`;

      const { output } = await generateText({
        model: this.anthropic(this.taggingModel),
        output: Output.object({ schema: tagExtractionSchema }),
        system: TAG_EXTRACTION_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxTokens: 1024,
      });

      if (!output) {
        logger.error("No structured output from LLM for tag extraction");
        return { tags: [], language: "en", confidence: 0 };
      }

      return {
        ...output,
        // Normalize tags to lowercase
        tags: output.tags.map((tag: string) => tag.toLowerCase()),
        // Normalize language to lowercase
        language: output.language.toLowerCase(),
      };
    } catch (error) {
      logger.error("Claude tag extraction failed", { error });
      return { tags: [], language: "en", confidence: 0 };
    }
  }

  async summarize(
    content: string,
    languageCode?: string | null,
  ): Promise<SummaryResult> {
    try {
      // Truncate content if too long (max ~100k tokens = ~400k characters)
      const truncatedContent = content.substring(0, 400000);

      const languageHint = languageCode
        ? `\nIMPORTANT: The article is in ${languageCode.toUpperCase()}. Generate all summaries in ${languageCode.toUpperCase()} language.\n`
        : "";

      const userPrompt = `Analyze this article and provide three different summaries (one sentence, one paragraph, and detailed).${languageHint}
Article content:
${truncatedContent}`;

      const { output } = await generateText({
        model: this.anthropic(this.summaryModel),
        output: Output.object({ schema: summarySchema }),
        system: SUMMARIZATION_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxTokens: 2048,
      });

      if (!output) {
        throw new Error("Failed to generate summary");
      }

      return output;
    } catch (error) {
      logger.error("Claude summarization failed", { error });
      throw new Error("Failed to generate summary");
    }
  }
}

let llmProvider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (llmProvider) {
    return llmProvider;
  }

  if (config.ANTHROPIC_API_KEY) {
    llmProvider = new ClaudeProvider(config.ANTHROPIC_API_KEY);
    return llmProvider;
  }

  // Noop provider
  llmProvider = {
    extractTags: async (_content: string, _existingTags: string[]) => ({
      tags: [],
      language: "en",
      confidence: 0,
    }),

    summarize: async (_content: string, _languageCode?: string | null) => {
      throw new ExternalServiceError("LLM provider not configured");
    },
  };

  return llmProvider;
}

export function isLLMAvailable() {
  return !!config.ANTHROPIC_API_KEY;
}
