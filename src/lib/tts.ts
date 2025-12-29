import { config } from "./config";

// Dynamic import type for ElevenLabs SDK (optional peer dependency)
type ElevenLabsClientType =
  typeof import("@elevenlabs/elevenlabs-js").ElevenLabsClient;

/**
 * Interface for TTS providers (real or noop)
 */
interface TTSProvider {
  generateStream(
    text: string,
    languageCode?: string | null,
  ): Promise<ReadableStream<Uint8Array>>;
}

/**
 * No-op TTS provider used when ELEVENLABS_API_KEY is not configured
 */
class NoopTTSProvider implements TTSProvider {
  async generateStream(
    _text: string,
    _languageCode?: string | null,
  ): Promise<ReadableStream<Uint8Array>> {
    throw new Error("TTS provider not configured");
  }
}

/**
 * Default TTS configuration
 * Using Flash v2.5 - fastest model with ~75ms latency
 */
const TTS_CONFIG = {
  modelId: "eleven_flash_v2_5", // Fastest model
  outputFormat: "mp3_44100_128" as const,
} as const;

/**
 * Language to voice ID mapping
 * Maps ISO 639-1 language codes to native ElevenLabs voices for better accent and pronunciation
 *
 * Find and test voices here: https://elevenlabs.io/voice-library
 * Filter by language, test voices, and copy voice IDs to customize this mapping
 */
const VOICE_MAP: Record<string, string> = {
  en: "21m00Tcm4TlvDq8ikWAM", // Rachel - English (US)
  es: "VR6AewLTigWG4xSOukaG", // Arnold - Spanish
  fr: "ThT5KcBeYPX3keUQqHPh", // Dorothy - French
  de: "ErXwobaYiN019PkySvjV", // Antoni - German
  it: "XB0fDUnXU5powFXDhCwa", // Charlotte - Italian
  pt: "pNInz6obpgDQGcFmaJgB", // Adam - Portuguese
  ru: "yoZ06aMxZJJ28mfd3POQ", // Freya - Russian
  ja: "TxGEqnHWrfWFTfGW9XjX", // Josh - Japanese
  zh: "onwK4e9ZLuTAKqWW03F9", // Serena - Chinese
  ko: "pqHfZKP75CvOlQylNhV4", // Bill - Korean
  ar: "ODq5zmih8GrVes37Dizd", // Patrick - Arabic
  hi: "pFZP5JQG7iQjIQuC4Bku", // Lily - Hindi
};

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/**
 * Get the best voice ID for the given language code
 * Returns a native voice for the language if available, otherwise defaults to Rachel (English)
 */
function getVoiceForLanguage(languageCode: string | null | undefined): string {
  if (!languageCode) return DEFAULT_VOICE_ID;
  return VOICE_MAP[languageCode.toLowerCase()] ?? DEFAULT_VOICE_ID;
}

/**
 * ElevenLabs TTS provider implementation
 */
class ElevenLabsTTSProvider implements TTSProvider {
  private client: InstanceType<ElevenLabsClientType>;

  constructor(apiKey: string, ElevenLabsSDK: ElevenLabsClientType) {
    this.client = new ElevenLabsSDK({
      apiKey,
    });
  }

  async generateStream(
    text: string,
    languageCode?: string | null,
  ): Promise<ReadableStream<Uint8Array>> {
    const voiceId = getVoiceForLanguage(languageCode);

    return this.client.textToSpeech.stream(voiceId, {
      text: text.slice(0, 40_000), // 40k chars is the limit for streaming
      modelId: TTS_CONFIG.modelId,
      outputFormat: TTS_CONFIG.outputFormat,
    });
  }
}

// Singleton instance
let ttsProvider: TTSProvider | null = null;

/**
 * Check if TTS functionality is available
 */
export function isTTSAvailable(): boolean {
  return !!config.ELEVENLABS_API_KEY;
}

/**
 * Get TTS provider (real or noop based on API key configuration)
 * If ELEVENLABS_API_KEY is not set, returns a noop provider that throws errors
 */
export async function getTTSProvider(): Promise<TTSProvider> {
  if (ttsProvider) {
    return ttsProvider;
  }

  // If no API key configured, return noop provider
  if (!config.ELEVENLABS_API_KEY) {
    console.warn("ELEVENLABS_API_KEY not configured, using noop TTS provider");
    ttsProvider = new NoopTTSProvider();
    return ttsProvider;
  }

  // Dynamic import of ElevenLabs SDK (optional peer dependency)
  try {
    const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
    ttsProvider = new ElevenLabsTTSProvider(
      config.ELEVENLABS_API_KEY,
      ElevenLabsClient,
    );
    return ttsProvider;
  } catch (error) {
    console.error(
      "Failed to import @elevenlabs/elevenlabs-js. Install it with: bun add @elevenlabs/elevenlabs-js",
      error,
    );
    throw new Error(
      "TTS functionality requires @elevenlabs/elevenlabs-js. Install it with: bun add @elevenlabs/elevenlabs-js",
    );
  }
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
 * Generate TTS audio stream for the given text
 * Returns a ReadableStream of audio chunks
 * Automatically selects the best voice based on the article's language
 */
export async function generateTTSStream(
  text: string,
  languageCode?: string | null,
): Promise<ReadableStream<Uint8Array>> {
  const provider = await getTTSProvider();
  return provider.generateStream(text, languageCode);
}
