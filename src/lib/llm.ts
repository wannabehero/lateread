import { config } from "./config";

export interface TagExtractionResult {
  tags: string[];
  confidence: number;
}

export interface SummaryResult {
  oneSentence: string;
  oneParagraph: string;
  long: string;
}

export interface LLMProvider {
  extractTags(
    content: string,
    existingTags: string[],
  ): Promise<TagExtractionResult>;
  summarize(content: string): Promise<SummaryResult>;
}

export class ClaudeProvider implements LLMProvider {
  private client: any;
  private taggingModel = "claude-haiku-4-5";
  private summaryModel = "claude-sonnet-4-5";

  constructor(apiKey: string) {
    // Dynamic import to avoid requiring the SDK if not using Claude
    try {
      const Anthropic = require("@anthropic-ai/sdk");
      this.client = new Anthropic.Anthropic({
        apiKey,
      });
    } catch (error) {
      throw new Error(
        "@anthropic-ai/sdk not installed. Run: bun add @anthropic-ai/sdk",
      );
    }
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
          ? `\n\nExisting tags to consider reusing:\n${existingTags.join(", ")}`
          : "";

      const prompt = `You are a content tagging assistant. Analyze the following article and extract 5-10 relevant tags.

If the user has existing tags that are semantically similar to what you would suggest, prefer reusing those existing tags.

Return your response as a JSON object with this structure:
{
  "tags": ["tag1", "tag2", "tag3"],
  "confidence": 0.85
}

Rules:
- Use lowercase for all tags
- Prefer existing tags when semantically similar
- Limit to 5-10 tags total
- Focus on main topics and themes
- Confidence should be 0-1 (how confident you are in the tagging)
${existingTagsText}

Article content:
${truncatedContent}`;

      const message = await this.client.messages.create({
        model: this.taggingModel,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Extract JSON from response
      const responseText = message.content[0].text;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        console.error("Failed to parse LLM response:", responseText);
        return { tags: [], confidence: 0 };
      }

      const result = JSON.parse(jsonMatch[0]);

      // Normalize tags to lowercase
      result.tags = result.tags.map((tag: string) => tag.toLowerCase());

      return result;
    } catch (error) {
      console.error("Claude tag extraction failed:", error);
      return { tags: [], confidence: 0 };
    }
  }

  async summarize(content: string): Promise<SummaryResult> {
    // Placeholder for Phase 4 - not implemented yet
    // Return mock data for now
    return {
      oneSentence: "Summary feature will be implemented in Phase 4.",
      oneParagraph:
        "This is a placeholder for the one-paragraph summary. The actual implementation will use Claude Sonnet to generate three different summary formats based on the article content.",
      long: "This is a placeholder for the detailed summary. In Phase 4, this will be implemented to provide a comprehensive ~500 word summary of the article, preserving key facts and main arguments.",
    };
  }
}

export async function getLLMProvider(): Promise<LLMProvider> {
  const provider = config.LLM_PROVIDER;
  const apiKey = config.LLM_API_KEY;

  switch (provider) {
    case "claude":
      return new ClaudeProvider(apiKey);

    case "openai":
      throw new Error(
        "OpenAI provider not implemented yet. Use claude for now.",
      );

    case "gemini":
      throw new Error(
        "Gemini provider not implemented yet. Use claude for now.",
      );

    case "local":
      throw new Error(
        "Local provider not implemented yet. Use claude for now.",
      );

    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
