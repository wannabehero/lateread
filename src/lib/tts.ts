import { config } from "./config";
import { ExternalServiceError } from "./errors";

export interface TTSProvider {
  generateStream(
    text: string,
    languageCode?: string | null,
  ): Promise<ReadableStream<Uint8Array>>;
}

/**
 * Gradium configuration
 */
const GRADIUM_CONFIG = {
  apiUrl: "https://api.gradium.ai/api/post/speech/tts",
  // Using opus for efficient streaming and browser support
  outputFormat: "opus",
} as const;

/**
 * Language to voice ID mapping for Gradium
 * Based on available voices:
 * en: Emma (US)
 * fr: Elise (FR)
 * de: Mia (DE)
 * es: Valentina (MX)
 * pt: Alice (BR)
 */
const GRADIUM_VOICE_MAP: Record<string, string> = {
  en: "YTpq7expH9539ERJ", // Emma - English (US)
  fr: "b35yykvVppLXyw_l", // Elise - French
  de: "-uP9MuGtBqAvEyxI", // Mia - German
  es: "B36pbz5_UoWn4BDl", // Valentina - Spanish (MX)
  pt: "pYcGZz9VOo4n2ynh", // Alice - Portuguese (BR)
};

const DEFAULT_VOICE_ID = "YTpq7expH9539ERJ"; // Emma

/**
 * Get the best voice ID for the given language code
 */
function getVoiceForLanguage(languageCode: string | null | undefined): string {
  if (!languageCode) return DEFAULT_VOICE_ID;
  return GRADIUM_VOICE_MAP[languageCode.toLowerCase()] ?? DEFAULT_VOICE_ID;
}

/**
 * Strip HTML tags and get plain text for TTS
 * Removes script/style tags, decodes HTML entities, and cleans whitespace
 */
export function htmlToPlainText(html: string): string {
  // Remove script and style tags with their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&apos;/g, "'");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&amp;/g, "&");

  // Clean up whitespace
  text = text.replace(/\s+/g, " ");
  text = text.trim();

  return text;
}

/**
 * Splits text into chunks respecting sentence boundaries and length limits
 */
export function splitTextIntoChunks(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let currentChunk = "";

  // Split by sentence terminators
  // Match sentence ending punctuation (.!?) followed by space or end of string
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > limit) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      // Handle sentences longer than limit
      if (sentence.length > limit) {
         let remaining = sentence;
         while (remaining.length > limit) {
            let splitIndex = remaining.lastIndexOf(" ", limit);
            if (splitIndex === -1) splitIndex = limit;

            chunks.push(remaining.slice(0, splitIndex).trim());
            remaining = remaining.slice(splitIndex).trim();
         }
         currentChunk = remaining;
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

class GradiumTTSProvider implements TTSProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateStream(
    text: string,
    languageCode?: string | null,
  ): Promise<ReadableStream<Uint8Array>> {
    const voiceId = getVoiceForLanguage(languageCode);
    // Use conservative limit well within Gradium's constraints
    const chunks = splitTextIntoChunks(text, 2000);
    const apiKey = this.apiKey;

    const iterator = async function* () {
      for (const chunk of chunks) {
        if (!chunk.trim()) continue;

        const response = await fetch(GRADIUM_CONFIG.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            text: chunk,
            voice_id: voiceId,
            output_format: GRADIUM_CONFIG.outputFormat,
            only_audio: true,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new ExternalServiceError(
            `Gradium API error: ${response.status} ${errorText}`,
          );
        }

        if (!response.body) continue;

        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) yield value;
          }
        } finally {
          reader.releaseLock();
        }
      }
    };

    const generator = iterator();
    return new ReadableStream({
      async pull(controller) {
        try {
          const { value, done } = await generator.next();
          if (done) {
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (e) {
          controller.error(e);
        }
      },
    });
  }
}

let ttsProvider: TTSProvider | null = null;

export function getTTSProvider(): TTSProvider {
  if (ttsProvider) {
    return ttsProvider;
  }

  if (config.GRADIUM_API_KEY) {
    ttsProvider = new GradiumTTSProvider(config.GRADIUM_API_KEY);
    return ttsProvider;
  }

  // Noop provider
  ttsProvider = {
    generateStream: async (_text: string, _languageCode?: string | null) => {
      throw new ExternalServiceError("TTS provider not configured");
    },
  };

  return ttsProvider;
}

export function isTTSAvailable() {
  return !!config.GRADIUM_API_KEY;
}

export function _resetTTSProvider() {
  ttsProvider = null;
}
