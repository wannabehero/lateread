import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { config } from "./config";

/**
 * Global ElevenLabs client instance
 */
export const elevenlabsClient = new ElevenLabsClient({
  apiKey: config.ELEVENLABS_API_KEY,
});

/**
 * Default TTS configuration
 * Using Flash v2.5 - fastest model with ~75ms latency
 * Voice: Rachel (21m00Tcm4TlvDq8ikWAM) - default female voice
 */
export const TTS_CONFIG = {
  voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel
  modelId: "eleven_flash_v2_5", // Fastest model
  outputFormat: "mp3_44100_128" as const,
} as const;

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
 */
export async function generateTTSStream(
  text: string,
): Promise<ReadableStream<Uint8Array>> {
  return elevenlabsClient.textToSpeech.stream(TTS_CONFIG.voiceId, {
    text: text.slice(0, 40_000), // 40k chars is the limit for streaming
    modelId: TTS_CONFIG.modelId,
    outputFormat: TTS_CONFIG.outputFormat,
  });
}
