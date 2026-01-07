import { beforeEach, describe, expect, it, mock } from "bun:test";
import { getTTSProvider, htmlToPlainText, isTTSAvailable } from "./tts";

// Mock ElevenLabs SDK globally
const mockStream = mock(() => Promise.resolve());

mock.module("@elevenlabs/elevenlabs-js", () => {
  return {
    ElevenLabsClient: class MockElevenLabsClient {
      textToSpeech = {
        stream: mockStream,
      };
    },
  };
});

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

  it("should decode quote entities", () => {
    const html = "He said &quot;Hello&quot; and &apos;Goodbye&apos;";
    const result = htmlToPlainText(html);
    expect(result).toBe("He said \"Hello\" and 'Goodbye'");
  });

  it("should clean up excessive whitespace", () => {
    const html = "<p>Hello    \n\n   world</p>";
    const result = htmlToPlainText(html);
    expect(result).toBe("Hello world");
  });

  it("should trim leading and trailing whitespace", () => {
    const html = "   <p>Hello world</p>   ";
    const result = htmlToPlainText(html);
    expect(result).toBe("Hello world");
  });

  it("should handle empty string", () => {
    const html = "";
    const result = htmlToPlainText(html);
    expect(result).toBe("");
  });

  it("should handle string with only tags", () => {
    const html = "<div><span><p></p></span></div>";
    const result = htmlToPlainText(html);
    expect(result).toBe("");
  });

  it("should handle nested tags", () => {
    const html =
      "<div><p>Outer <span>inner <strong>deeply nested</strong></span></p></div>";
    const result = htmlToPlainText(html);
    expect(result).toBe("Outer inner deeply nested");
  });

  it("should handle mixed content with tags, entities, and whitespace", () => {
    const html = `
      <article>
        <h1>Article&nbsp;Title</h1>
        <p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
        <script>alert('bad');</script>
        <p>Quote: &quot;Hello&quot; &amp; &lt;tag&gt;</p>
      </article>
    `;
    const result = htmlToPlainText(html);
    expect(result).toContain("Article Title");
    expect(result).toContain("This is a paragraph with bold and italic text.");
    expect(result).toContain('Quote: "Hello" & <tag>');
    expect(result).not.toContain("alert");
    expect(result).not.toContain("<h1>");
    expect(result).not.toContain("<strong>");
  });

  it("should handle self-closing tags", () => {
    const html = "Before <br /> middle <img src='test.jpg' /> after";
    const result = htmlToPlainText(html);
    expect(result).toBe("Before middle after");
  });

  it("should handle complex article HTML", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>.test { color: red; }</style>
          <script>var x = 1;</script>
        </head>
        <body>
          <h1>Article Title</h1>
          <p class="intro">This is the introduction with &nbsp; spaces.</p>
          <div>
            <p>First paragraph.</p>
            <p>Second&nbsp;paragraph with&nbsp;nbsp.</p>
          </div>
        </body>
      </html>
    `;
    const result = htmlToPlainText(html);
    expect(result).toContain("Article Title");
    expect(result).toContain("This is the introduction with spaces.");
    expect(result).toContain("First paragraph.");
    expect(result).toContain("Second paragraph with nbsp.");
    expect(result).not.toContain("<!DOCTYPE");
    expect(result).not.toContain("<html>");
    expect(result).not.toContain("var x = 1");
    expect(result).not.toContain("color: red");
  });

  it("should handle tags with attributes", () => {
    const html = '<a href="https://example.com" class="link">Click here</a>';
    const result = htmlToPlainText(html);
    expect(result).toBe("Click here");
  });

  it("should handle multiline script tags", () => {
    const html = `
      <p>Before</p>
      <script>
        function test() {
          console.log('test');
        }
      </script>
      <p>After</p>
    `;
    const result = htmlToPlainText(html);
    expect(result).not.toContain("function test");
    expect(result).not.toContain("console.log");
    expect(result).toContain("Before");
    expect(result).toContain("After");
  });

  it("should handle multiline style tags", () => {
    const html = `
      <p>Content</p>
      <style>
        body {
          margin: 0;
          padding: 0;
        }
      </style>
      <p>More</p>
    `;
    const result = htmlToPlainText(html);
    expect(result).not.toContain("margin");
    expect(result).not.toContain("padding");
    expect(result).toContain("Content");
    expect(result).toContain("More");
  });

  it("should preserve text order", () => {
    const html = "<div>First</div><div>Second</div><div>Third</div>";
    const result = htmlToPlainText(html);
    expect(result).toContain("First");
    expect(result).toContain("Second");
    expect(result).toContain("Third");
    const firstIndex = result.indexOf("First");
    const secondIndex = result.indexOf("Second");
    const thirdIndex = result.indexOf("Third");
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
  });
});

describe("ElevenLabsTTSProvider", () => {
  beforeEach(() => {
    mockStream.mockReset();
  });

  describe("generateStream", () => {
    it("should generate stream with English voice by default", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      const result = await provider.generateStream("Hello world");

      expect(result).toBe(mockReadableStream);
      expect(mockStream).toHaveBeenCalledTimes(1);

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];
      const options = callArgs?.[1];

      expect(voiceId).toBe("21m00Tcm4TlvDq8ikWAM"); // Rachel - English
      expect(options?.text).toBe("Hello world");
      expect(options?.modelId).toBe("eleven_flash_v2_5");
      expect(options?.outputFormat).toBe("mp3_44100_128");
    });

    it("should use correct voice for Spanish (es)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("Hola mundo", "es");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("VR6AewLTigWG4xSOukaG"); // Arnold - Spanish
    });

    it("should use correct voice for French (fr)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("Bonjour le monde", "fr");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("ThT5KcBeYPX3keUQqHPh"); // Dorothy - French
    });

    it("should use correct voice for German (de)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("Hallo Welt", "de");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("ErXwobaYiN019PkySvjV"); // Antoni - German
    });

    it("should use correct voice for Italian (it)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("Ciao mondo", "it");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("XB0fDUnXU5powFXDhCwa"); // Charlotte - Italian
    });

    it("should use correct voice for Portuguese (pt)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("Olá mundo", "pt");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("pNInz6obpgDQGcFmaJgB"); // Adam - Portuguese
    });

    it("should use correct voice for Russian (ru)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("Привет мир", "ru");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("yoZ06aMxZJJ28mfd3POQ"); // Freya - Russian
    });

    it("should use correct voice for Japanese (ja)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("こんにちは世界", "ja");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("TxGEqnHWrfWFTfGW9XjX"); // Josh - Japanese
    });

    it("should use correct voice for Chinese (zh)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("你好世界", "zh");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("onwK4e9ZLuTAKqWW03F9"); // Serena - Chinese
    });

    it("should use correct voice for Korean (ko)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("안녕하세요 세계", "ko");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("pqHfZKP75CvOlQylNhV4"); // Bill - Korean
    });

    it("should use correct voice for Arabic (ar)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("مرحبا بالعالم", "ar");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("ODq5zmih8GrVes37Dizd"); // Patrick - Arabic
    });

    it("should use correct voice for Hindi (hi)", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("नमस्ते दुनिया", "hi");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("pFZP5JQG7iQjIQuC4Bku"); // Lily - Hindi
    });

    it("should use default voice for unsupported language", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("Text", "unsupported");

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("21m00Tcm4TlvDq8ikWAM"); // Default - Rachel
    });

    it("should use default voice for null languageCode", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("Text", null);

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("21m00Tcm4TlvDq8ikWAM"); // Default - Rachel
    });

    it("should use default voice for undefined languageCode", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("Text", undefined);

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("21m00Tcm4TlvDq8ikWAM"); // Default - Rachel
    });

    it("should handle case-insensitive language codes", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("Text", "ES"); // Uppercase

      const callArgs = mockStream.mock.calls[0];
      const voiceId = callArgs?.[0];

      expect(voiceId).toBe("VR6AewLTigWG4xSOukaG"); // Spanish voice
    });

    it("should truncate text longer than 40k characters", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      const longText = "a".repeat(50000);
      await provider.generateStream(longText);

      const callArgs = mockStream.mock.calls[0];
      const options = callArgs?.[1];
      const sentText = options?.text;

      expect(sentText?.length).toBe(40000);
      expect(sentText?.startsWith("aaa")).toBe(true);
    });

    it("should not truncate text shorter than 40k characters", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      const text = "a".repeat(30000);
      await provider.generateStream(text);

      const callArgs = mockStream.mock.calls[0];
      const options = callArgs?.[1];
      const sentText = options?.text;

      expect(sentText?.length).toBe(30000);
      expect(sentText).toBe(text);
    });

    it("should handle exactly 40k characters", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      const text = "a".repeat(40000);
      await provider.generateStream(text);

      const callArgs = mockStream.mock.calls[0];
      const options = callArgs?.[1];
      const sentText = options?.text;

      expect(sentText?.length).toBe(40000);
      expect(sentText).toBe(text);
    });

    it("should propagate API errors", async () => {
      mockStream.mockRejectedValue(new Error("API error"));

      const provider = getTTSProvider();

      await expect(provider.generateStream("Test")).rejects.toThrow(
        "API error",
      );
    });

    it("should handle empty text", async () => {
      const mockReadableStream = new ReadableStream<Uint8Array>();
      mockStream.mockResolvedValue(mockReadableStream);

      const provider = getTTSProvider();
      await provider.generateStream("");

      const callArgs = mockStream.mock.calls[0];
      const options = callArgs?.[1];

      expect(options?.text).toBe("");
    });
  });
});

describe("getTTSProvider and isTTSAvailable", () => {
  it("isTTSAvailable should return true when API key is set", () => {
    // .env.test has ELEVENLABS_API_KEY set
    const result = isTTSAvailable();
    expect(result).toBe(true);
  });

  it("getTTSProvider should return ElevenLabsTTSProvider when API key is set", () => {
    // .env.test has ELEVENLABS_API_KEY set
    const provider = getTTSProvider();

    expect(provider).toBeDefined();
    expect(typeof provider.generateStream).toBe("function");
  });

  it("getTTSProvider should cache provider instance (singleton)", () => {
    const provider1 = getTTSProvider();
    const provider2 = getTTSProvider();

    // Both should be the same instance
    expect(provider1).toBe(provider2);
  });

  // Note: Tests for behavior when API key is NOT set have been removed
  // because they require mocking config which causes global test pollution.
  // The fallback logic is simple (checks if config.ELEVENLABS_API_KEY exists)
  // and is covered by integration tests.
});
