import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mock ai SDK globally
const mockGenerateText = mock((_args: any) => Promise.resolve({} as any));

mock.module("ai", () => {
  return {
    generateText: mockGenerateText,
    Output: {
      object: ({ schema }: any) => ({ type: "object", schema }),
    },
  };
});

// Import after mocking
import { getLLMProvider, isLLMAvailable, OpenRouterProvider } from "./llm";

describe("OpenRouterProvider", () => {
  // Create a new provider instance for each test
  const createProvider = () => new OpenRouterProvider("test-api-key");

  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  describe("extractTags", () => {
    it("should extract and normalize tags from content", async () => {
      mockGenerateText.mockResolvedValue({
        output: {
          tags: ["Technology", "AI", "Machine-Learning"],
          language: "EN",
          confidence: 0.95,
        },
      });

      const provider = createProvider();
      const result = await provider.extractTags(
        "Test content about AI and ML",
        [],
      );

      expect(result.tags).toEqual(["technology", "ai", "machine-learning"]);
      expect(result.language).toBe("en");
      expect(result.confidence).toBe(0.95);
      expect(mockGenerateText).toHaveBeenCalledTimes(1);

      const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
      expect(callArgs?.maxOutputTokens).toBe(1024);
    });

    it("should include existing tags in prompt when provided", async () => {
      mockGenerateText.mockResolvedValue({
        output: {
          tags: ["programming", "javascript"],
          language: "en",
          confidence: 0.9,
        },
      });

      const provider = createProvider();
      const existingTags = ["programming", "javascript", "typescript"];
      await provider.extractTags("Content about JS", existingTags);

      const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
      const prompt = callArgs?.prompt as string;
      expect(prompt).toContain("Existing tags to consider reusing:");
      expect(prompt).toContain("programming, javascript, typescript");
    });

    it("should truncate content longer than 40k characters", async () => {
      mockGenerateText.mockResolvedValue({
        output: {
          tags: ["test"],
          language: "en",
          confidence: 0.8,
        },
      });

      const provider = createProvider();
      const longContent = "a".repeat(50000);
      await provider.extractTags(longContent, []);

      const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
      const prompt = callArgs?.prompt as string;
      // The content should be truncated to 40k chars, plus some prompt text
      expect(prompt.length).toBeLessThan(longContent.length);
      expect(prompt).toContain("a".repeat(100)); // Should still have some content
    });

    it("should return fallback on API errors", async () => {
      mockGenerateText.mockRejectedValue(new Error("API error"));

      const provider = createProvider();
      const result = await provider.extractTags("Test content", []);

      expect(result).toEqual({
        tags: [],
        language: "en",
        confidence: 0,
      });
    });

    it("should return fallback when output is null", async () => {
      mockGenerateText.mockResolvedValue({
        output: null,
      });

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
    it("should generate summaries in two formats", async () => {
      mockGenerateText.mockResolvedValue({
        output: {
          oneSentence: "This is a one sentence summary.",
          oneParagraph:
            "This is a one paragraph summary with more details about the content.",
        },
      });

      const provider = createProvider();
      const result = await provider.summarize("Article content here");

      expect(result.oneSentence).toBe("This is a one sentence summary.");
      expect(result.oneParagraph).toBe(
        "This is a one paragraph summary with more details about the content.",
      );
      expect(mockGenerateText).toHaveBeenCalledTimes(1);

      const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
      expect(callArgs?.maxOutputTokens).toBe(1024);
    });

    it("should include language hint when languageCode is provided", async () => {
      mockGenerateText.mockResolvedValue({
        output: {
          oneSentence: "Это краткое резюме.",
          oneParagraph: "Это параграф резюме.",
        },
      });

      const provider = createProvider();
      await provider.summarize("Статья на русском", "ru");

      const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
      const prompt = callArgs?.prompt as string;
      expect(prompt).toContain("The article is in RU");
      expect(prompt).toContain("Generate all summaries in RU language");
    });

    it("should not include language hint when languageCode is null", async () => {
      mockGenerateText.mockResolvedValue({
        output: {
          oneSentence: "Summary.",
          oneParagraph: "Summary paragraph.",
        },
      });

      const provider = createProvider();
      await provider.summarize("Article content", null);

      const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
      const prompt = callArgs?.prompt as string;
      expect(prompt).not.toContain("IMPORTANT: The article is in");
    });

    it("should truncate content longer than 3M characters", async () => {
      mockGenerateText.mockResolvedValue({
        output: {
          oneSentence: "Summary.",
          oneParagraph: "Summary paragraph.",
        },
      });

      const provider = createProvider();
      const longContent = "a".repeat(3_500_000);
      await provider.summarize(longContent);

      const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
      const prompt = callArgs?.prompt as string;
      expect(prompt.length).toBeLessThan(longContent.length);
      expect(prompt).toContain("a".repeat(3_000_000));
      expect(prompt).not.toContain("a".repeat(3_000_001));
    });

    it("should throw error on API errors", async () => {
      mockGenerateText.mockRejectedValue(new Error("API error"));

      const provider = createProvider();

      await expect(provider.summarize("Test content")).rejects.toThrow(
        "Failed to generate summary",
      );
    });

    it("should throw error when output is null", async () => {
      mockGenerateText.mockResolvedValue({
        output: null,
      });

      const provider = createProvider();

      await expect(provider.summarize("Test content")).rejects.toThrow(
        "Failed to generate summary",
      );
    });
  });
});

describe("getLLMProvider and isLLMAvailable", () => {
  it("isLLMAvailable should return true when API key is set", () => {
    // .env.test has OPENROUTER_API_KEY set
    const result = isLLMAvailable();
    expect(result).toBe(true);
  });

  it("getLLMProvider should return OpenRouterProvider when API key is set", () => {
    // .env.test has OPENROUTER_API_KEY set
    const provider = getLLMProvider();

    expect(provider).toBeDefined();
    expect(typeof provider.extractTags).toBe("function");
    expect(typeof provider.summarize).toBe("function");
  });
});
