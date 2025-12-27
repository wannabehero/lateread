import { config } from "./config";
import {
  SUMMARIZATION_SYSTEM_PROMPT,
  TAG_EXTRACTION_SYSTEM_PROMPT,
} from "./llm-prompts";
import { defaultLogger } from "./logger";

const logger = defaultLogger.child({ module: "llm" });

// Dynamic import type for Anthropic SDK (optional peer dependency)
type Anthropic = typeof import("@anthropic-ai/sdk").default;

export interface TagExtractionResult {
  tags: string[];
  language: string;
  confidence: number;
}

export interface SummaryResult {
  oneSentence: string;
  oneParagraph: string;
  long: string;
}

/**
 * Extract JSON from LLM response text
 * Returns fallback value if JSON is not found or invalid
 *
 * Limitations:
 * - Extracts first JSON object found
 * - Does not support multiple separate JSON objects
 * - Designed for simple flat objects (tags, summaries)
 */
export function extractJsonFromResponse<T>(
  responseText: string,
  fallback: T,
): T {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    logger.warn("No JSON found in LLM response", { responseText });
    return fallback;
  }

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch (error) {
    logger.error("Failed to parse JSON from LLM response", { error });
    return fallback;
  }
}

/**
 * Interface for LLM providers (real or noop)
 */
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

/**
 * No-op LLM provider used when ANTHROPIC_API_KEY is not configured
 * Returns default values for all operations
 */
class NoopLLMProvider implements LLMProvider {
  async extractTags(
    _content: string,
    _existingTags: string[],
  ): Promise<TagExtractionResult> {
    return { tags: [], language: "en", confidence: 0 };
  }

  async summarize(
    _content: string,
    _languageCode?: string | null,
  ): Promise<SummaryResult> {
    throw new Error("LLM provider not configured");
  }
}

class ClaudeProvider implements LLMProvider {
  private client: InstanceType<Anthropic>;
  private taggingModel = "claude-haiku-4-5";
  private summaryModel = "claude-sonnet-4-5";

  constructor(apiKey: string, AnthropicSDK: Anthropic) {
    this.client = new AnthropicSDK({
      apiKey,
    });
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

      const message = await this.client.messages.create({
        model: this.taggingModel,
        max_tokens: 1024,
        system: TAG_EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      // Extract JSON from response
      const firstBlock = message.content[0];
      if (!firstBlock || firstBlock.type !== "text") {
        logger.error("Unexpected response format from LLM");
        return { tags: [], language: "en", confidence: 0 };
      }

      const result = extractJsonFromResponse<TagExtractionResult>(
        firstBlock.text,
        { tags: [], language: "en", confidence: 0 },
      );

      return {
        ...result,
        // Normalize tags to lowercase
        tags: result.tags.map((tag: string) => tag.toLowerCase()),
        // Normalize language to lowercase
        language: result.language.toLowerCase(),
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

      const message = await this.client.messages.create({
        model: this.summaryModel,
        max_tokens: 2048,
        system: SUMMARIZATION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      // Extract JSON from response
      const firstBlock = message.content[0];
      if (!firstBlock || firstBlock.type !== "text") {
        logger.warn("Unexpected response format from LLM");
        throw new Error("Failed to generate summary");
      }

      const result = extractJsonFromResponse<SummaryResult>(firstBlock.text, {
        oneSentence: "",
        oneParagraph: "",
        long: "",
      });

      // Validate we got actual content
      if (!result.oneSentence || !result.oneParagraph || !result.long) {
        throw new Error("Incomplete summary response from LLM");
      }

      return result;
    } catch (error) {
      logger.error("Claude summarization failed", { error });
      throw new Error("Failed to generate summary");
    }
  }
}

// Singleton instance
let llmProvider: LLMProvider | null = null;

/**
 * Check if LLM functionality is available
 */
export function isLLMAvailable(): boolean {
  return !!config.ANTHROPIC_API_KEY;
}

/**
 * Get LLM provider (real or noop based on API key configuration)
 * If ANTHROPIC_API_KEY is not set, returns a noop provider that:
 * - Returns empty tags and default language for extractTags
 * - Throws error for summarize (should not be called)
 */
export async function getLLMProvider(): Promise<LLMProvider> {
  if (llmProvider) {
    return llmProvider;
  }

  // If no API key configured, return noop provider
  if (!config.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY not configured, using noop LLM provider");
    llmProvider = new NoopLLMProvider();
    return llmProvider;
  }

  // Dynamic import of Anthropic SDK (optional peer dependency)
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    llmProvider = new ClaudeProvider(config.ANTHROPIC_API_KEY, Anthropic);
    return llmProvider;
  } catch (error) {
    console.error(
      "Failed to import @anthropic-ai/sdk. Install it with: bun add @anthropic-ai/sdk",
      error,
    );
    throw new Error(
      "LLM functionality requires @anthropic-ai/sdk. Install it with: bun add @anthropic-ai/sdk",
    );
  }
}
