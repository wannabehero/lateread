import { config } from "./config";
import { ExternalServiceError } from "./errors";
import { defaultLogger } from "./logger";

export interface TTSProvider {
  generateStream(
    text: string,
    languageCode?: string | null,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
}

const logger = defaultLogger.child({ module: "tts" });

/**
 * Gradium configuration
 */
const GRADIUM_CONFIG = {
  apiUrl: "https://eu.api.gradium.ai/api/post/speech/tts",
  // Using opus for efficient streaming - can concatenate opus packets
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

class GradiumHTTPTTSProvider implements TTSProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateStream(
    text: string,
    languageCode?: string | null,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const voiceId = getVoiceForLanguage(languageCode);
    // Gradium free tier limit: 1500 chars per session. Use 1200 to be safe.
    const chunks = splitTextIntoChunks(text, 1200);
    const apiKey = this.apiKey;

    const iterator = async function* () {
      for (const chunk of chunks) {
        // Check if client disconnected
        if (signal?.aborted) {
          logger.debug("TTS streaming aborted by client");
          return;
        }

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
          signal, // Pass abort signal to cancel in-flight requests
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new ExternalServiceError(
            `Gradium API error: ${response.status} ${errorText}`,
          );
        }

        if (!response.body) {
          logger.error("No response body from Gradium API");
          continue;
        }

        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              yield value;
            }
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

class GradiumWebSocketTTSProvider implements TTSProvider {
  private apiKey: string;
  private wsUrl = "wss://eu.api.gradium.ai/api/speech/tts";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateStream(
    text: string,
    languageCode?: string | null,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const voiceId = getVoiceForLanguage(languageCode);
    const chunks = splitTextIntoChunks(text, 1200);

    const iterator = async function* (
      apiKey: string,
      wsUrl: string,
      voiceId: string,
      chunks: string[],
      signal?: AbortSignal,
    ) {
      const ws = new WebSocket(
        wsUrl,
        {
          headers: {
            "x-api-key": apiKey,
          },
        } as any, // Bun's WebSocket supports headers, but TypeScript doesn't know this
      );

      const messageQueue: Uint8Array[] = [];
      let wsError: Error | null = null;
      let resolveOpen: (() => void) | null = null;
      const openPromise = new Promise<void>((resolve) => {
        resolveOpen = resolve;
      });

      let lastAudioTime = Date.now();
      let receivedAudioChunks = false;

      // Handle WebSocket events
      ws.addEventListener("open", () => {
        logger.debug("WebSocket TTS connection opened");
        if (resolveOpen) resolveOpen();
      });

      ws.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data as string);

          if (data.type === "audio") {
            // Decode base64 audio and add to queue
            const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
              c.charCodeAt(0),
            );

            // Opus format: all chunks are just opus packets that can be concatenated
            messageQueue.push(audioBytes);
            lastAudioTime = Date.now();
            receivedAudioChunks = true;
          } else if (data.type === "error") {
            wsError = new ExternalServiceError(
              `Gradium WebSocket error: ${data.message} (code: ${data.code})`,
            );
            logger.error("WebSocket error", {
              message: data.message,
              code: data.code,
            });
          }
        } catch (error) {
          logger.error("Failed to parse WebSocket message", { error });
        }
      });

      ws.addEventListener("error", (event) => {
        wsError = new ExternalServiceError(
          `WebSocket connection error: ${event}`,
        );
        logger.error("WebSocket error", { error: event });
      });

      ws.addEventListener("close", () => {
        logger.debug("WebSocket TTS connection closed");
      });

      // Handle abort signal
      if (signal) {
        signal.addEventListener("abort", () => {
          logger.debug("TTS streaming aborted by client");
          ws.close();
        });
      }

      try {
        // Wait for connection to open
        await openPromise;

        // Send setup message
        // Use opus format for better streaming (can concatenate opus packets)
        ws.send(
          JSON.stringify({
            type: "setup",
            model_name: "default",
            voice_id: voiceId,
            output_format: "opus",
          }),
        );

        // Send all text chunks
        for (const chunk of chunks) {
          if (signal?.aborted || wsError) break;
          if (!chunk.trim()) continue;

          ws.send(
            JSON.stringify({
              type: "text",
              text: chunk,
            }),
          );
        }

        // Now wait for all audio chunks to arrive
        // Keep yielding chunks until we haven't received any for 5 seconds
        const IDLE_TIMEOUT = 5000; // 5 seconds idle timeout
        const MAX_WAIT = 30000; // 30 seconds max total wait
        const startTime = Date.now();

        let totalChunks = 0;
        while (true) {
          if (signal?.aborted || wsError) break;

          // Yield any available chunks
          while (messageQueue.length > 0) {
            const audioChunk = messageQueue.shift();
            if (audioChunk) {
              yield audioChunk;
              totalChunks++;
            }
          }

          // Check if we've been idle for too long
          const idleTime = Date.now() - lastAudioTime;
          if (receivedAudioChunks && idleTime > IDLE_TIMEOUT) {
            // No audio received for 5 seconds after we got some audio, we're done
            logger.debug("WebSocket idle timeout", {
              idleTime,
              totalChunks,
              totalTime: Date.now() - startTime,
            });
            break;
          }

          // Check for max wait timeout
          const totalTime = Date.now() - startTime;
          if (totalTime > MAX_WAIT) {
            logger.warn("WebSocket TTS max wait time exceeded", {
              totalTime,
              receivedAudioChunks,
              totalChunks,
            });
            break;
          }

          // Wait a bit before checking again
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (wsError) throw wsError;
      } finally {
        ws.close();
      }
    };

    const generator = iterator(
      this.apiKey,
      this.wsUrl,
      voiceId,
      chunks,
      signal,
    );

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
          logger.error("WebSocket TTS stream error", { error: e });
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
    const mode = config.GRADIUM_TTS_MODE;
    if (mode === "websocket") {
      ttsProvider = new GradiumWebSocketTTSProvider(config.GRADIUM_API_KEY);
      logger.info("Using Gradium WebSocket TTS provider");
    } else {
      ttsProvider = new GradiumHTTPTTSProvider(config.GRADIUM_API_KEY);
      logger.info("Using Gradium HTTP TTS provider");
    }
    return ttsProvider;
  }

  // Noop provider
  ttsProvider = {
    generateStream: async (
      _text: string,
      _languageCode?: string | null,
      _signal?: AbortSignal,
    ) => {
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
