import type { Context } from "grammy";
import { marked } from "marked";

export interface MessageMetadata {
  title: string;
  description: string;
  url: string;
  siteName: string;
  htmlContent: string;
}

/**
 * Extract metadata and content from a Telegram message
 * Handles channels, forwarded messages, and regular messages
 * Supports both text messages and media with captions
 */
export async function extractMessageMetadata(
  ctx: Context,
): Promise<MessageMetadata | null> {
  if (!ctx.message || !ctx.chat) {
    return null;
  }

  // Get text or caption from message
  const messageText =
    ("text" in ctx.message && ctx.message.text) ||
    ("caption" in ctx.message && ctx.message.caption) ||
    null;

  if (!messageText) {
    return null;
  }

  const message = ctx.message;
  const chat = ctx.chat;

  // Extract title: first line, truncated to 64 chars
  const lines = messageText.split("\n");
  const firstLine = lines[0] || messageText.substring(0, 64);
  const title =
    firstLine.length > 64 ? `${firstLine.substring(0, 64)}...` : firstLine;

  // Extract description: next 200 chars after first line
  const restOfText = lines.slice(1).join("\n").trim();
  const description =
    restOfText.length > 200
      ? `${restOfText.substring(0, 200)}...`
      : restOfText || title.substring(0, 200);

  // Determine URL and author
  let url: string;
  let siteName: string;

  // Check if message is from a channel with username
  if (chat.type === "channel" && "username" in chat && chat.username) {
    url = `https://t.me/${chat.username}/${message.message_id}`;
    siteName =
      "title" in chat ? chat.title || "Telegram Channel" : "Telegram Channel";
  }
  // Check if forwarded from a channel
  else if (
    "forward_from_chat" in message &&
    message.forward_from_chat &&
    typeof message.forward_from_chat === "object" &&
    "type" in message.forward_from_chat &&
    message.forward_from_chat.type === "channel" &&
    "username" in message.forward_from_chat &&
    typeof message.forward_from_chat.username === "string" &&
    message.forward_from_chat.username
  ) {
    url = `https://t.me/${message.forward_from_chat.username}`;
    siteName =
      "title" in message.forward_from_chat &&
      typeof message.forward_from_chat.title === "string"
        ? message.forward_from_chat.title
        : "Telegram Channel";
  }
  // Check if forwarded from anywhere
  else if ("forward_date" in message && message.forward_date) {
    url = "https://lateread.app";
    siteName = "Forwarded to Telegram";
  }
  // Regular message
  else {
    url = "https://lateread.app";
    siteName = "Telegram Message";
  }

  // Convert markdown to HTML
  let htmlContent: string;
  try {
    htmlContent = await marked(messageText);
  } catch (error) {
    console.error("Failed to convert markdown to HTML:", error);
    // Fallback: wrap in <p> tags
    htmlContent = `<p>${messageText.replace(/\n/g, "<br>")}</p>`;
  }

  return {
    title,
    description,
    url,
    siteName,
    htmlContent,
  };
}

/**
 * Extract first URL from message text
 */
export function extractUrl(text: string): string | null {
  // Simple URL regex - matches http:// and https://
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const matches = text.match(urlRegex);

  if (matches && matches.length > 0) {
    // Return first URL only
    return matches[0];
  }

  return null;
}
