import { Hono } from "hono";
import { config } from "../lib/config";
import { defaultLogger } from "../lib/logger";
import { htmlToPlainText, splitTextIntoChunks } from "../lib/tts";
import { upgradeWebSocket } from "../lib/websocket";
import { requireAuth } from "../middleware/auth";
import { articleIdParam } from "../schemas/common";
import { getArticleWithTagsById } from "../services/articles.service";
import { getArticleContent } from "../services/content.service";
import type { AppContext } from "../types/context";

const logger = defaultLogger.child({ module: "tts-ws" });

const GRADIUM_WS_URL = "wss://eu.api.gradium.ai/api/speech/tts";

// Language to voice ID mapping for Gradium
const GRADIUM_VOICE_MAP: Record<string, string> = {
  en: "YTpq7expH9539ERJ", // Emma - English (US)
  fr: "b35yykvVppLXyw_l", // Elise - French
  de: "-uP9MuGtBqAvEyxI", // Mia - German
  es: "B36pbz5_UoWn4BDl", // Valentina - Spanish (MX)
  pt: "pYcGZz9VOo4n2ynh", // Alice - Portuguese (BR)
};

const DEFAULT_VOICE_ID = "YTpq7expH9539ERJ"; // Emma

function getVoiceForLanguage(languageCode: string | null | undefined): string {
  if (!languageCode) return DEFAULT_VOICE_ID;
  return GRADIUM_VOICE_MAP[languageCode.toLowerCase()] ?? DEFAULT_VOICE_ID;
}

const ttsWs = new Hono<AppContext>();

/**
 * WebSocket TTS endpoint: /ws/tts/:id
 */
ttsWs.get(
  "/ws/tts/:id",
  requireAuth("redirect"), // Authenticate first
  upgradeWebSocket((c) => {
    // Store Gradium WebSocket in closure so it's accessible to all handlers
    let gradiumWs: WebSocket | null = null;

    return {
      async onOpen(event, ws) {
        const userId = c.get("userId") as string;

        // Manually validate article ID param
        const validationResult = articleIdParam.safeParse({
          id: c.req.param("id"),
        });

        if (!validationResult.success) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid article ID",
            }),
          );
          ws.close();
          return;
        }

        const articleId = validationResult.data.id;

        logger.info("TTS WebSocket opened", { articleId, userId });

        try {
          // Verify article exists and belongs to user
          const article = await getArticleWithTagsById(articleId, userId);

          // Get article content from cache
          const htmlContent = await getArticleContent(
            userId,
            articleId,
            article.url,
          );

          // Convert HTML to plain text
          const plainText = htmlToPlainText(htmlContent);

          if (!plainText) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "No content available for TTS",
              }),
            );
            ws.close();
            return;
          }

          // Split text into chunks (1200 char limit for Gradium free tier)
          const chunks = splitTextIntoChunks(plainText, 1200);
          const voiceId = getVoiceForLanguage(article.language);

          // Connect to Gradium WebSocket
          gradiumWs = new WebSocket(
            GRADIUM_WS_URL,
            {
              headers: {
                "x-api-key": config.GRADIUM_API_KEY || "",
              },
            } as any, // Bun's WebSocket supports headers, but TypeScript doesn't know this
          );

          // Handle Gradium WebSocket events
          gradiumWs.addEventListener("open", () => {
            // Send setup message
            gradiumWs?.send(
              JSON.stringify({
                type: "setup",
                model_name: "default",
                voice_id: voiceId,
                output_format: "wav", // PCM format for easier client-side playback
              }),
            );
          });

          gradiumWs.addEventListener("message", (event) => {
            try {
              const data = JSON.parse(event.data as string);

              if (data.type === "audio") {
                // Forward audio chunk to client as binary
                const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
                  c.charCodeAt(0),
                );
                ws.send(audioBytes);
              } else if (data.type === "ready") {
                // Gradium is ready to receive text - send all chunks now
                for (const chunk of chunks) {
                  if (!chunk.trim()) continue;
                  gradiumWs?.send(
                    JSON.stringify({
                      type: "text",
                      text: chunk,
                    }),
                  );
                }
                // Forward ready message to client
                ws.send(JSON.stringify({ type: "ready" }));
              } else if (data.type === "error") {
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: data.message,
                  }),
                );
                logger.error("Gradium WebSocket error", { error: data });
              }
            } catch (error) {
              logger.error("Failed to parse Gradium message", { error });
            }
          });

          gradiumWs.addEventListener("close", () => {
            ws.send(JSON.stringify({ type: "complete" }));
            ws.close();
          });

          gradiumWs.addEventListener("error", (event) => {
            logger.error("Gradium WebSocket error", { error: event });
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Connection to TTS service failed",
              }),
            );
            ws.close();
          });
        } catch (error) {
          logger.error("TTS WebSocket error", { error });
          ws.send(
            JSON.stringify({
              type: "error",
              message: error instanceof Error ? error.message : "Unknown error",
            }),
          );
          ws.close();
        }
      },

      onMessage(event, ws) {
        // Client doesn't need to send messages, but handle close request
        if (event.data === "close") {
          ws.close();
        }
      },

      onClose(event, ws) {
        logger.debug("TTS WebSocket closed by client");
        // Clean up Gradium WebSocket when client disconnects
        if (
          gradiumWs &&
          (gradiumWs.readyState === WebSocket.OPEN ||
            gradiumWs.readyState === WebSocket.CONNECTING)
        ) {
          gradiumWs.close();
        }
      },

      onError(event, ws) {
        logger.error("TTS WebSocket error", { error: event });
        // Clean up Gradium WebSocket on error
        if (
          gradiumWs &&
          (gradiumWs.readyState === WebSocket.OPEN ||
            gradiumWs.readyState === WebSocket.CONNECTING)
        ) {
          gradiumWs.close();
        }
      },
    };
  }),
);

export default ttsWs;
