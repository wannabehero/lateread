import { createOpenRouter } from "@openrouter/ai-sdk-provider";
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

export class OpenRouterProvider implements LLMProvider {
  private openrouter: ReturnType<typeof createOpenRouter>;
  private taggingModel = "qwen/qwen3.5-9b";
  private summaryModel = "deepseek/deepseek-v4-flash";

  constructor(apiKey: string) {
    this.openrouter = createOpenRouter({ apiKey });
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
        model: this.openrouter(this.taggingModel),
        output: Output.object({ schema: tagExtractionSchema }),
        system: TAG_EXTRACTION_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 1024,
        temperature: 0.2,
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
      logger.error("Tag extraction failed", { error });
      return { tags: [], language: "en", confidence: 0 };
    }
  }

  async summarize(
    content: string,
    languageCode?: string | null,
  ): Promise<SummaryResult> {
    try {
      // deepseek-v4-flash has a 1M token context window. Cap input at
      // ~3M characters (~750k tokens) to leave room for the system prompt,
      // structured-output overhead, and a safety margin.
      const truncatedContent = content.substring(0, 3000000);

      const languageHint = languageCode
        ? `\nIMPORTANT: The article is in ${languageCode.toUpperCase()}. Generate all summaries in ${languageCode.toUpperCase()} language.\n`
        : "";

      const userPrompt = `Analyze this article and provide two different summaries (one sentence and one paragraph).${languageHint}
Article content:
${truncatedContent}`;

      const { output } = await generateText({
        model: this.openrouter(this.summaryModel),
        output: Output.object({ schema: summarySchema }),
        system: SUMMARIZATION_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 1024,
        temperature: 0.3,
      });

      if (!output) {
        throw new Error("Failed to generate summary");
      }

      return output;
    } catch (error) {
      logger.error("Summarization failed", { error });
      throw new Error("Failed to generate summary");
    }
  }
}

let llmProvider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (llmProvider) {
    return llmProvider;
  }

  if (config.OPENROUTER_API_KEY) {
    llmProvider = new OpenRouterProvider(config.OPENROUTER_API_KEY);
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
  return !!config.OPENROUTER_API_KEY;
}
