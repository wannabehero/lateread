import { describe, expect, it } from "bun:test";
import { extractJsonFromResponse } from "./llm";

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
