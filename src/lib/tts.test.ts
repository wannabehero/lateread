import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  _resetTTSProvider,
  getTTSProvider,
  htmlToPlainText,
  isTTSAvailable,
  splitTextIntoChunks,
} from "./tts";

// Mock fetch globally
const mockFetch = mock();
global.fetch = mockFetch;

describe("htmlToPlainText", () => {
  it("should remove basic HTML tags", () => {
    const html = "<p>Hello <strong>world</strong>!</p>";
    const result = htmlToPlainText(html);
    expect(result).toBe("Hello world !");
  });

  it("should remove script tags and their content", () => {
    const html = `
      <div>Before script</div>
      <script>console.log('remove me');</script>
      <div>After script</div>
    `;
    const result = htmlToPlainText(html);
    expect(result).not.toContain("console.log");
    expect(result).toContain("Before script");
    expect(result).toContain("After script");
  });

  it("should remove style tags and their content", () => {
    const html = `
      <div>Content</div>
      <style>.hidden { display: none; }</style>
      <div>More content</div>
    `;
    const result = htmlToPlainText(html);
    expect(result).not.toContain("display: none");
    expect(result).toContain("Content");
    expect(result).toContain("More content");
  });

  it("should decode HTML entities", () => {
    const html = "Hello&nbsp;world &amp; friends&lt;br&gt;";
    const result = htmlToPlainText(html);
    expect(result).toBe("Hello world & friends<br>");
  });
});

describe("splitTextIntoChunks", () => {
  it("should return single chunk if text is within limit", () => {
    const text = "Hello world";
    const result = splitTextIntoChunks(text, 100);
    expect(result).toEqual(["Hello world"]);
  });

  it("should split text by sentences", () => {
    const text = "Hello world. This is a test. Another sentence.";
    const result = splitTextIntoChunks(text, 20);
    // "Hello world." (12)
    // "This is a test." (15)
    // "Another sentence." (17)
    expect(result).toEqual([
      "Hello world.",
      "This is a test.",
      "Another sentence.",
    ]);
  });

  it("should combine short sentences into chunks", () => {
    const text = "Hi. How are you? I am fine.";
    const result = splitTextIntoChunks(text, 20);
    // "Hi. How are you?" (16) -> fits
    // "I am fine." (10) -> fits in new chunk
    // Combined: 27 > 20
    expect(result).toEqual(["Hi. How are you?", "I am fine."]);
  });

  it("should hard split very long sentences", () => {
    const longSentence = "a".repeat(30);
    const result = splitTextIntoChunks(longSentence, 10);
    expect(result).toEqual(["a".repeat(10), "a".repeat(10), "a".repeat(10)]);
  });

  it("should handle mixed sentence lengths and hard splits", () => {
    const text = "Short. " + "a".repeat(30) + ". End.";
    const result = splitTextIntoChunks(text, 10);
    // "Short." (6) -> fits
    // "a"*30 (30) -> too long for current chunk (6+30 > 10) -> new chunk
    // "a"*30 -> split -> 10, 10, 10
    // ". End." (6) -> fits in new chunk

    // Actually splitTextIntoChunks implementation:
    // Sentence 1: "Short. " (7)
    // Sentence 2: "a...a. " (32)
    // Sentence 3: "End." (4)

    // Loop 1: current="Short. "
    // Loop 2: current(7) + sent(32) > 10? Yes.
    // Push "Short.". current=""
    // sent(32) > 10? Yes.
    // Split sent: "a"*10, "a"*10, "a"*10, "aa. "
    // current = "aa. "
    // Loop 3: current(4) + sent(4) > 10? No. 8 <= 10.
    // current += "End."
    // End loop. Push current.

    expect(result).toEqual([
      "Short.",
      "a".repeat(10),
      "a".repeat(10),
      "a".repeat(10),
      ".End.",
    ]);
  });
});

describe("GradiumTTSProvider", () => {
  beforeEach(() => {
    _resetTTSProvider();
    mockFetch.mockReset();
  });

  describe("generateStream", () => {
    it("should call Gradium API with correct parameters", async () => {
      mockFetch.mockResolvedValue(new Response("audio data"));

      const provider = getTTSProvider();
      const stream = await provider.generateStream("Hello world");

      // Consume stream
      const reader = stream.getReader();
      while (!(await reader.read()).done) {}

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0];
      const options = callArgs[1];

      expect(url).toBe("https://eu.api.gradium.ai/api/post/speech/tts");
      expect(options.method).toBe("POST");
      expect(options.headers["x-api-key"]).toBeDefined();

      const body = JSON.parse(options.body);
      expect(body.text).toBe("Hello world");
      expect(body.voice_id).toBe("YTpq7expH9539ERJ"); // Default/English
      expect(body.output_format).toBe("opus");
      expect(body.only_audio).toBe(true);
    });

    it("should handle multiple chunks", async () => {
      mockFetch.mockResolvedValue(new Response("audio"));

      const provider = getTTSProvider();
      // "a" * 2001 chars.
      // splitTextIntoChunks limit is 2000.
      const text = "a".repeat(2001);

      const stream = await provider.generateStream(text);
      const reader = stream.getReader();
      while (!(await reader.read()).done) {}

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should use correct voice for French", async () => {
      mockFetch.mockResolvedValue(new Response("audio"));
      const provider = getTTSProvider();
      const stream = await provider.generateStream("Bonjour", "fr");
      const reader = stream.getReader();
      while (!(await reader.read()).done) {}

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice_id).toBe("b35yykvVppLXyw_l"); // Elise
    });

    it("should throw ExternalServiceError on API error", async () => {
      mockFetch.mockResolvedValue(
        new Response("Error", { status: 400, statusText: "Bad Request" }),
      );

      const provider = getTTSProvider();
      const stream = await provider.generateStream("Hello");

      // Error happens when generator yields, so we need to read from stream
      const reader = stream.getReader();
      try {
        await expect(reader.read()).rejects.toThrow("Gradium API error");
      } finally {
        reader.releaseLock();
      }
    });
  });
});

describe("getTTSProvider and isTTSAvailable", () => {
  beforeEach(() => {
    _resetTTSProvider();
  });

  it("isTTSAvailable should return true when API key is set", () => {
    // .env.test has GRADIUM_API_KEY set
    const result = isTTSAvailable();
    expect(result).toBe(true);
  });

  it("getTTSProvider should return provider instance when API key is set", () => {
    const provider = getTTSProvider();
    expect(provider).toBeDefined();
    expect(typeof provider.generateStream).toBe("function");
  });

  it("getTTSProvider should cache provider instance (singleton)", () => {
    const provider1 = getTTSProvider();
    const provider2 = getTTSProvider();
    expect(provider1).toBe(provider2);
  });
});
