import { beforeEach, describe, expect, it, mock } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";

// Mock Anthropic SDK globally
const mockAnthropicCreate = mock(() => Promise.resolve());

mock.module("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockAnthropicCreate,
      };
    },
  };
});

// Import after mocking
import {
  ClaudeProvider,
  extractJsonFromResponse,
  getLLMProvider,
  isLLMAvailable,
} from "./llm";

describe("extractJsonFromResponse", () => {
  it("extracts tag response with array", () => {
    const response = '{"tags": ["javascript", "testing"], "confidence": 0.9}';
    const result = extractJsonFromResponse<{
      tags: string[];
      confidence: number;
    }>(response, {
      tags: [],
      confidence: 0,
    });

    expect(result.tags).toEqual(["javascript", "testing"]);
    expect(result.confidence).toBe(0.9);
  });

  it("extracts summary response with strings", () => {
    const response =
      '{"oneSentence": "Short.", "oneParagraph": "Longer text.", "long": "Very long text."}';
    const result = extractJsonFromResponse(response, {
      oneSentence: "",
      oneParagraph: "",
      long: "",
    });

    expect(result.oneSentence).toBe("Short.");
    expect(result.oneParagraph).toBe("Longer text.");
    expect(result.long).toBe("Very long text.");
  });

  it("handles JSON with surrounding text (common LLM behavior)", () => {
    const response =
      'Sure! Here is the result:\n{"tags": ["nodejs"], "confidence": 0.8}\nHope this helps!';
    const result = extractJsonFromResponse<{
      tags: string[];
      confidence: number;
    }>(response, {
      tags: [],
      confidence: 0,
    });

    expect(result.tags).toEqual(["nodejs"]);
  });

  it("handles multiline formatted JSON", () => {
    const response = `Here you go:
{
  "tags": ["typescript", "bun"],
  "confidence": 0.95
}`;
    const result = extractJsonFromResponse<{
      tags: string[];
      confidence: number;
    }>(response, {
      tags: [],
      confidence: 0,
    });

    expect(result.tags).toEqual(["typescript", "bun"]);
    expect(result.confidence).toBe(0.95);
  });

  it("returns fallback when no JSON found", () => {
    const response = "Sorry, I couldn't analyze that article.";
    const fallback = { tags: ["default"], confidence: 0 };
    const result = extractJsonFromResponse(response, fallback);

    expect(result).toEqual(fallback);
  });

  it("returns fallback when JSON is malformed", () => {
    const response = '{"tags": ["broken", invalid syntax}';
    const fallback: { tags: string[]; confidence: number } = {
      tags: [],
      confidence: 0,
    };
    const result = extractJsonFromResponse(response, fallback);

    expect(result).toEqual(fallback);
  });

  it("handles JSON with escaped characters", () => {
    const response = '{"oneSentence": "Article about \\"AI\\" technology."}';
    const result = extractJsonFromResponse(response, { oneSentence: "" });

    expect(result.oneSentence).toBe('Article about "AI" technology.');
  });

  it("handles empty arrays and zero values", () => {
    const response = '{"tags": [], "confidence": 0}';
    const result = extractJsonFromResponse<{
      tags: string[];
      confidence: number;
    }>(response, {
      tags: ["fallback"],
      confidence: 1,
    });

    expect(result.tags).toEqual([]);
    expect(result.confidence).toBe(0);
  });
});

describe("ClaudeProvider", () => {
  // Create a new provider instance for each test
  const createProvider = () => new ClaudeProvider("test-api-key");

  beforeEach(() => {
    mockAnthropicCreate.mockReset();
  });

  describe("extractTags", () => {
    it("should extract and normalize tags from content", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        content: [
          {
            type: "text",
            text: '{"tags": ["Technology", "AI", "Machine-Learning"], "language": "EN", "confidence": 0.95}',
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();
      const result = await provider.extractTags(
        "Test content about AI and ML",
        [],
      );

      expect(result.tags).toEqual(["technology", "ai", "machine-learning"]);
      expect(result.language).toBe("en");
      expect(result.confidence).toBe(0.95);
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);

      const callArgs = mockAnthropicCreate.mock.calls[0]?.[0];
      expect(callArgs?.model).toBe("claude-haiku-4-5");
      expect(callArgs?.max_tokens).toBe(1024);
    });

    it("should include existing tags in prompt when provided", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        content: [
          {
            type: "text",
            text: '{"tags": ["programming", "javascript"], "language": "en", "confidence": 0.9}',
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();
      const existingTags = ["programming", "javascript", "typescript"];
      await provider.extractTags("Content about JS", existingTags);

      const callArgs = mockAnthropicCreate.mock.calls[0]?.[0];
      const userContent = callArgs?.messages[0]?.content as string;
      expect(userContent).toContain("Existing tags to consider reusing:");
      expect(userContent).toContain("programming, javascript, typescript");
    });

    it("should truncate content longer than 40k characters", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        content: [
          {
            type: "text",
            text: '{"tags": ["test"], "language": "en", "confidence": 0.8}',
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();
      const longContent = "a".repeat(50000);
      await provider.extractTags(longContent, []);

      const callArgs = mockAnthropicCreate.mock.calls[0]?.[0];
      const userContent = callArgs?.messages[0]?.content as string;
      // The content should be truncated to 40k chars, plus some prompt text
      expect(userContent.length).toBeLessThan(longContent.length);
      expect(userContent).toContain("a".repeat(100)); // Should still have some content
    });

    it("should return fallback on API errors", async () => {
      mockAnthropicCreate.mockRejectedValue(new Error("API error"));

      const provider = createProvider();
      const result = await provider.extractTags("Test content", []);

      expect(result).toEqual({
        tags: [],
        language: "en",
        confidence: 0,
      });
    });

    it("should return fallback when response has no content blocks", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        content: [],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();
      const result = await provider.extractTags("Test content", []);

      expect(result).toEqual({
        tags: [],
        language: "en",
        confidence: 0,
      });
    });

    it("should return fallback when response contains no valid JSON", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        content: [
          {
            type: "text",
            text: "I cannot extract tags from this content",
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();
      const result = await provider.extractTags("Test content", []);

      expect(result).toEqual({
        tags: [],
        language: "en",
        confidence: 0,
      });
    });
  });

  describe("summarize", () => {
    it("should generate summaries in three formats", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              oneSentence: "This is a one sentence summary.",
              oneParagraph:
                "This is a one paragraph summary with more details about the content.",
              long: "This is a long detailed summary that covers all the main points of the article.",
            }),
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();
      const result = await provider.summarize("Article content here");

      expect(result.oneSentence).toBe("This is a one sentence summary.");
      expect(result.oneParagraph).toBe(
        "This is a one paragraph summary with more details about the content.",
      );
      expect(result.long).toBe(
        "This is a long detailed summary that covers all the main points of the article.",
      );
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);

      const callArgs = mockAnthropicCreate.mock.calls[0]?.[0];
      expect(callArgs?.model).toBe("claude-sonnet-4-5");
      expect(callArgs?.max_tokens).toBe(2048);
    });

    it("should include language hint when languageCode is provided", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              oneSentence: "Это краткое резюме.",
              oneParagraph: "Это параграф резюме.",
              long: "Это длинное резюме.",
            }),
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();
      await provider.summarize("Статья на русском", "ru");

      const callArgs = mockAnthropicCreate.mock.calls[0]?.[0];
      const userContent = callArgs?.messages[0]?.content as string;
      expect(userContent).toContain("The article is in RU");
      expect(userContent).toContain("Generate all summaries in RU language");
    });

    it("should not include language hint when languageCode is null", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              oneSentence: "Summary.",
              oneParagraph: "Summary paragraph.",
              long: "Long summary.",
            }),
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();
      await provider.summarize("Article content", null);

      const callArgs = mockAnthropicCreate.mock.calls[0]?.[0];
      const userContent = callArgs?.messages[0]?.content as string;
      expect(userContent).not.toContain("IMPORTANT: The article is in");
    });

    it("should truncate content longer than 400k characters", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              oneSentence: "Summary.",
              oneParagraph: "Summary paragraph.",
              long: "Long summary.",
            }),
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();
      const longContent = "a".repeat(500000);
      await provider.summarize(longContent);

      const callArgs = mockAnthropicCreate.mock.calls[0]?.[0];
      const userContent = callArgs?.messages[0]?.content as string;
      expect(userContent.length).toBeLessThan(longContent.length);
      expect(userContent).toContain("a".repeat(100)); // Should still have some content
    });

    it("should throw error on API errors", async () => {
      mockAnthropicCreate.mockRejectedValue(new Error("API error"));

      const provider = createProvider();

      await expect(provider.summarize("Test content")).rejects.toThrow(
        "Failed to generate summary",
      );
    });

    it("should throw error when response has no content blocks", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();

      await expect(provider.summarize("Test content")).rejects.toThrow(
        "Failed to generate summary",
      );
    });

    it("should throw error when summary fields are empty - oneSentence", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              oneSentence: "",
              oneParagraph: "Paragraph.",
              long: "Long summary.",
            }),
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();

      await expect(provider.summarize("Test content")).rejects.toThrow(
        "Failed to generate summary",
      );
    });

    it("should throw error when summary fields are empty - oneParagraph", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              oneSentence: "Summary.",
              oneParagraph: "",
              long: "Long summary.",
            }),
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();

      await expect(provider.summarize("Test content")).rejects.toThrow(
        "Failed to generate summary",
      );
    });

    it("should throw error when summary fields are empty - long", async () => {
      const mockResponse: Anthropic.Messages.Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              oneSentence: "Summary.",
              oneParagraph: "Paragraph.",
              long: "",
            }),
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const provider = createProvider();

      await expect(provider.summarize("Test content")).rejects.toThrow(
        "Failed to generate summary",
      );
    });
  });
});

describe("getLLMProvider and isLLMAvailable", () => {
  it("isLLMAvailable should return true when API key is set", () => {
    // .env.test has ANTHROPIC_API_KEY set
    const result = isLLMAvailable();
    expect(result).toBe(true);
  });

  it("getLLMProvider should return ClaudeProvider when API key is set", () => {
    // .env.test has ANTHROPIC_API_KEY set
    const provider = getLLMProvider();

    expect(provider).toBeDefined();
    expect(typeof provider.extractTags).toBe("function");
    expect(typeof provider.summarize).toBe("function");
  });

  // Note: Tests for behavior when API key is NOT set have been removed
  // because they require mocking config which causes global test pollution.
  // The fallback logic is simple (checks if config.ANTHROPIC_API_KEY exists)
  // and is covered by integration tests.
});
