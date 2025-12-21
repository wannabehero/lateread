import { eq } from "drizzle-orm";
import type { Bot, Context } from "grammy";
import { articles, telegramUsers } from "../db/schema";
import { claimAuthToken } from "../lib/auth";
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
    const url = extractUrl(ctx.message.text);

    if (!url) {
      // No URL found, ignore message
      return;
    }

    // Check if user is authenticated
    const telegramId = ctx.from?.id.toString();

    if (!telegramId) {
      return;
    }

    // Query TelegramUser by telegramId
    const [telegramUser] = await db
      .select()
      .from(telegramUsers)
      .where(eq(telegramUsers.telegramId, telegramId))
      .limit(1);

    if (!telegramUser) {
      await ctx.reply(
        "Please log in first at the web app to start saving articles.\n\n" +
          "Once you're logged in, send me any URL and I'll save it for you.",
      );
      return;
    }

    // Create article record
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
      console.error(`Failed to create article record for ${url}`);
      return;
    }

    // React with eyes emoji
    try {
      await ctx.react("👀");
    } catch (error) {
      console.error("Failed to add reaction:", error);
    }

    // Spawn worker (non-blocking)
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;

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
