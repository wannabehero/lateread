import { eq } from "drizzle-orm";
import type { Bot, Context } from "grammy";
import { marked } from "marked";
import { articles, telegramUsers } from "../db/schema";
import { claimAuthToken } from "../lib/auth";
import { config } from "../lib/config";
import { contentCache } from "../lib/content-cache";
import { db } from "../lib/db";
import { spawnArticleWorker } from "../lib/worker";

/**
 * Register all bot command handlers
 */
export function registerHandlers(bot: Bot) {
  // /start command - welcome message or handle deep link login
  bot.command("start", async (ctx) => {
    const startPayload = ctx.match;

    console.log("startPayload:", startPayload);

    // Check if this is a login deep link
    if (startPayload?.startsWith("login_")) {
      const token = startPayload.replace("login_", "");
      await handleLogin(ctx, token);
      return;
    }

    // Regular welcome message
    await ctx.reply(
      "Welcome to lateread!\n\n" +
        "This bot helps you save articles to read later.\n\n" +
        "To get started:\n" +
        "1. Log in at the web app\n" +
        "2. Send me any URL and I'll save it for you\n\n" +
        "Commands:\n" +
        "/start - Show this message\n" +
        "/login <token> - Complete web app authentication\n" +
        "/help - Get help",
    );
  });

  // /login command - manual authentication fallback
  bot.command("login", async (ctx) => {
    const token = ctx.match.trim();

    if (!token) {
      await ctx.reply(
        "Please provide a login token.\n\n" +
          "Usage: /login <token>\n\n" +
          "Get your token from the web app.",
      );
      return;
    }

    await handleLogin(ctx, token);
  });

  // /help command
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "How to use lateread:\n\n" +
        "1. Log in at the web app to connect your Telegram account\n" +
        "2. Send me any article URL (or forward a message with a URL)\n" +
        "3. I'll save it and process it automatically\n" +
        "4. Read your saved articles at the web app\n\n" +
        "Commands:\n" +
        "/start - Welcome message\n" +
        "/login <token> - Complete authentication\n" +
        "/help - Show this help\n\n" +
        "Features:\n" +
        "- Automatic article extraction\n" +
        "- AI-powered tagging\n" +
        "- Clean reading experience\n" +
        "- Article summaries",
    );
  });

  // Handle messages with URLs
  bot.on("message:text", async (ctx) => {
    console.log(
      `[Bot] Received message from user ${ctx.from?.id}: "${ctx.message.text.substring(0, 100)}..."`,
    );

    // Check if message is long enough to treat as article
    if (ctx.message.text.length >= config.LONG_MESSAGE_THRESHOLD) {
      console.log(
        `[Bot] Message length ${ctx.message.text.length} >= threshold ${config.LONG_MESSAGE_THRESHOLD}, treating as article`,
      );
      await handleLongMessage(ctx);
      return;
    }

    const url = extractUrl(ctx.message.text);

    if (!url) {
      console.log("[Bot] No URL found in message, ignoring");
      return;
    }

    console.log(`[Bot] Extracted URL: ${url}`);

    // Check if user is authenticated
    const telegramId = ctx.from?.id.toString();

    if (!telegramId) {
      console.log("[Bot] No telegram ID found, ignoring");
      return;
    }

    // Query TelegramUser by telegramId
    const [telegramUser] = await db
      .select()
      .from(telegramUsers)
      .where(eq(telegramUsers.telegramId, telegramId))
      .limit(1);

    if (!telegramUser) {
      console.log(`[Bot] User ${telegramId} not authenticated`);
      await ctx.reply(
        "Please log in first at the web app to start saving articles.\n\n" +
          "Once you're logged in, send me any URL and I'll save it for you.",
      );
      return;
    }

    console.log(
      `[Bot] User authenticated: ${telegramUser.userId} (telegram: ${telegramId})`,
    );

    // Create article record
    console.log(`[Bot] Creating article record for URL: ${url}`);
    const [article] = await db
      .insert(articles)
      .values({
        userId: telegramUser.userId,
        url: url,
        status: "pending",
        processingAttempts: 0,
      })
      .returning();

    if (!article) {
      console.error(`[Bot] Failed to create article record for ${url}`);
      return;
    }

    console.log(`[Bot] Article created with ID: ${article.id}`);

    // React with eyes emoji
    try {
      await ctx.react("👀");
      console.log(`[Bot] Added 👀 reaction to message`);
    } catch (error) {
      console.error("[Bot] Failed to add reaction:", error);
    }

    // Spawn worker (non-blocking)
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;

    console.log(`[Bot] Spawning worker for article ${article.id}`);
    spawnArticleWorker({
      articleId: article.id,
      onSuccess: async () => {
        try {
          await ctx.api.setMessageReaction(chatId, messageId, [
            { type: "emoji", emoji: "👍" },
          ]);
        } catch (err) {
          console.error("Failed to update Telegram reaction:", err);
        }
      },
      onFailure: async () => {
        try {
          await ctx.api.setMessageReaction(chatId, messageId, [
            { type: "emoji", emoji: "👎" },
          ]);
        } catch (err) {
          console.error("Failed to update Telegram reaction:", err);
        }
      },
    });
  });

  console.log("Bot handlers registered");
}

/**
 * Extract first URL from message text
 */
function extractUrl(text: string): string | null {
  // Simple URL regex - matches http:// and https://
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const matches = text.match(urlRegex);

  if (matches && matches.length > 0) {
    // Return first URL only
    return matches[0];
  }

  return null;
}

/**
 * Handle long Telegram messages as articles
 */
async function handleLongMessage(ctx: Context) {
  const telegramId = ctx.from?.id.toString();

  if (!telegramId) {
    console.log("[Bot] No telegram ID found, ignoring");
    return;
  }

  if (!ctx.message || !("text" in ctx.message) || !ctx.message.text) {
    console.log("[Bot] No text message found, ignoring");
    return;
  }

  const messageText = ctx.message.text;
  const message = ctx.message;
  const chat = ctx.chat;

  if (!chat) {
    console.log("[Bot] No chat found, ignoring");
    return;
  }

  // Check if user is authenticated
  const [telegramUser] = await db
    .select()
    .from(telegramUsers)
    .where(eq(telegramUsers.telegramId, telegramId))
    .limit(1);

  if (!telegramUser) {
    console.log(`[Bot] User ${telegramId} not authenticated`);
    await ctx.reply(
      "Please log in first at the web app to start saving articles.\n\n" +
        "Once you're logged in, send me any message and I'll save it for you.",
    );
    return;
  }

  console.log(
    `[Bot] User authenticated: ${telegramUser.userId} (telegram: ${telegramId})`,
  );

  // Extract title: first line, truncated to 64 chars
  const lines = messageText.split("\n");
  const firstLine = lines[0] || messageText.substring(0, 64);
  const title =
    firstLine.length > 64 ? firstLine.substring(0, 64) + "..." : firstLine;

  // Extract description: next 200 chars after first line
  const restOfText = lines.slice(1).join("\n").trim();
  const description =
    restOfText.length > 200
      ? restOfText.substring(0, 200) + "..."
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
    url = `lateread://telegram-message`;
    siteName = "Forwarded to Telegram";
  }
  // Regular message
  else {
    url = `lateread://telegram-message`;
    siteName = "Telegram Message";
  }

  console.log(`[Bot] Processing long message: title="${title}", url="${url}"`);

  // Convert markdown to HTML
  let htmlContent: string;
  try {
    htmlContent = await marked(messageText);
  } catch (error) {
    console.error("[Bot] Failed to convert markdown to HTML:", error);
    // Fallback: wrap in <p> tags
    htmlContent = `<p>${messageText.replace(/\n/g, "<br>")}</p>`;
  }

  // Create article record
  console.log(`[Bot] Creating article record for long message`);
  const [article] = await db
    .insert(articles)
    .values({
      userId: telegramUser.userId,
      url: url,
      title: title,
      description: description,
      siteName: siteName,
      status: "pending",
      processingAttempts: 0,
    })
    .returning();

  if (!article) {
    console.error(`[Bot] Failed to create article record`);
    return;
  }

  console.log(`[Bot] Article created with ID: ${article.id}`);

  // Cache HTML content immediately
  try {
    await contentCache.set(telegramUser.userId, article.id, htmlContent);
    console.log(`[Bot] Content cached for article ${article.id}`);
  } catch (error) {
    console.error(
      `[Bot] Failed to cache content for article ${article.id}:`,
      error,
    );
    // Continue anyway - worker will retry if needed
  }

  // React with eyes emoji
  try {
    await ctx.react("👀");
    console.log(`[Bot] Added 👀 reaction to message`);
  } catch (error) {
    console.error("[Bot] Failed to add reaction:", error);
  }

  // Spawn worker (non-blocking)
  const chatId = chat.id;
  const messageId = message.message_id;

  console.log(`[Bot] Spawning worker for article ${article.id}`);
  spawnArticleWorker({
    articleId: article.id,
    onSuccess: async () => {
      try {
        await ctx.api.setMessageReaction(chatId, messageId, [
          { type: "emoji", emoji: "👍" },
        ]);
      } catch (err) {
        console.error("Failed to update Telegram reaction:", err);
      }
    },
    onFailure: async () => {
      try {
        await ctx.api.setMessageReaction(chatId, messageId, [
          { type: "emoji", emoji: "👎" },
        ]);
      } catch (err) {
        console.error("Failed to update Telegram reaction:", err);
      }
    },
  });
}

/**
 * Handle login authentication flow
 */
async function handleLogin(ctx: Context, token: string) {
  try {
    const telegramId = ctx.from?.id.toString();
    const username = ctx.from?.username || null;
    const firstName = ctx.from?.first_name || null;
    const lastName = ctx.from?.last_name || null;

    if (!telegramId) {
      await ctx.reply("Error: Unable to identify your Telegram account.");
      return;
    }

    const result = await claimAuthToken(
      token,
      telegramId,
      username,
      firstName,
      lastName,
    );

    if (!result) {
      await ctx.reply(
        "Login failed. The authentication link may have expired or is invalid.\n\n" +
          "Please try logging in again from the web app.",
      );
      return;
    }

    await ctx.reply(
      "Login successful!\n\n" +
        "You can now return to the web app and start saving articles.\n\n" +
        "Send me any URL to save an article.",
    );
  } catch (error) {
    console.error("Login error:", error);
    await ctx.reply(
      "An error occurred during login. Please try again.\n\n" +
        "If the problem persists, please contact support.",
    );
  }
}
