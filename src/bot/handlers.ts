import type { Bot, Context } from "grammy";
import { claimAuthToken } from "../lib/auth";
import { config } from "../lib/config";
import { contentCache } from "../lib/content-cache";
import { spawnArticleWorker } from "../lib/worker";
import { createArticle } from "../services/articles.service";
import { getTelegramUserByTelegramId } from "../services/telegram-users.service";
import { extractMessageMetadata, extractUrl } from "./helpers";

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
        "This bot helps you save articles and long messages to read later.\n\n" +
        "To get started:\n" +
        "1. Log in at the web app: https://lateread.app/\n" +
        "2. Send me any URL or long message to save it automatically\n\n" +
        { link_preview_options: { is_disabled: true } },
    );
  });

  // /login command - manual authentication fallback
  bot.command("login", async (ctx) => {
    const token = ctx.match.trim();

    if (!token) {
      await ctx.reply(
        "Please provide a login token.\n\n" +
          "Usage: /login <token>\n\n" +
          "Get your token from the web app at https://lateread.app/",
      );
      return;
    }

    await handleLogin(ctx, token);
  });

  // /help command
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "How to use lateread:\n\n" +
        "1. Log in at the web app: https://lateread.app/ to connect your Telegram account\n" +
        "2. Send me any article URL, or forward a message with a URL\n" +
        "3. Send me long messages directly to save them as articles\n" +
        "4. I'll process and save them automatically\n" +
        "5. Read your saved articles at the web app\n\n" +
        "Features:\n" +
        "✨ Automatic article extraction from URLs\n" +
        "🤖 AI-powered tagging and organization\n" +
        "🧹 Clean, distraction-free reading experience\n" +
        "📘 Automatic article summaries",
      {
        link_preview_options: {
          is_disabled: true,
        },
      },
    );
  });

  bot.command("ping", async (ctx) => {
    await ctx.reply("Pong!");
  });

  // Handle messages with URLs (text or captions from media)
  bot.on([":text", ":caption"], async (ctx) => {
    if (!ctx.message) {
      return;
    }

    // Get text or caption from message
    const messageText =
      ("text" in ctx.message && ctx.message.text) ||
      ("caption" in ctx.message && ctx.message.caption) ||
      "";

    console.log(
      `[Bot] Received message from user ${ctx.from?.id}: "${messageText.substring(0, 100)}..."`,
    );

    // Check if message is long enough to treat as article
    if (messageText.length >= config.LONG_MESSAGE_THRESHOLD) {
      console.log(
        `[Bot] Message length ${messageText.length} >= threshold ${config.LONG_MESSAGE_THRESHOLD}, treating as article`,
      );
      await handleLongMessage(ctx);
      return;
    }

    const url = extractUrl(messageText);

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

    const telegramUser = await getTelegramUserByTelegramId(telegramId);

    if (!telegramUser) {
      console.log(`[Bot] User ${telegramId} not authenticated`);
      await ctx.reply(
        "Please log in first at the web app to start saving articles.\n\n" +
          "Once you're logged in, send me any URL or long message and I'll save it for you.\n\n" +
          "Log in here: https://lateread.app/",
      );
      return;
    }

    console.log(
      `[Bot] User authenticated: ${telegramUser.userId} (telegram: ${telegramId})`,
    );

    // Create article record
    console.log(`[Bot] Creating article record for URL: ${url}`);
    const article = await createArticle({
      userId: telegramUser.userId,
      url: url,
    });

    console.log(`[Bot] Article created with ID: ${article.id}`);

    // React with eyes emoji
    try {
      await ctx.react("👀");
      console.log(`[Bot] Added 👀 reaction to message`);
    } catch (error) {
      console.error("[Bot] Failed to add reaction:", error);
    }

    // Spawn worker (non-blocking)
    if (!ctx.chat || !ctx.message) {
      return;
    }

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
 * Handle long Telegram messages as articles
 */
async function handleLongMessage(ctx: Context) {
  const telegramId = ctx.from?.id.toString();

  if (!telegramId) {
    console.log("[Bot] No telegram ID found, ignoring");
    return;
  }

  // Check if user is authenticated
  const telegramUser = await getTelegramUserByTelegramId(telegramId);

  if (!telegramUser) {
    console.log(`[Bot] User ${telegramId} not authenticated`);
    await ctx.reply(
      "Please log in first at the web app to start saving articles.\n\n" +
        "Once you're logged in, send me any URL or long message and I'll save it for you.\n\n" +
        "Log in here: https://lateread.app/",
    );
    return;
  }

  console.log(
    `[Bot] User authenticated: ${telegramUser.userId} (telegram: ${telegramId})`,
  );

  // Extract metadata from message
  const metadata = await extractMessageMetadata(ctx);

  if (!metadata) {
    console.log("[Bot] Failed to extract message metadata");
    return;
  }

  const { title, description, url, siteName, htmlContent } = metadata;

  console.log(`[Bot] Processing long message: title="${title}", url="${url}"`);

  // Create article record
  console.log(`[Bot] Creating article record for long message`);
  const article = await createArticle({
    userId: telegramUser.userId,
    url: url,
    title: title,
    description: description,
    siteName: siteName,
  });

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
  if (!ctx.chat || !ctx.message) {
    console.log("[Bot] No chat or message found for worker callbacks");
    return;
  }

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
          "Please try logging in again from the web app at https://lateread.app/",
        {
          link_preview_options: {
            is_disabled: true,
          },
        },
      );
      return;
    }

    await ctx.reply(
      "🎉 Login successful!\n\n" +
        "You can now return to the web app at https://lateread.app/.\n\n" +
        "Send me any URL or a long message to save as an article. I'll automatically extract the content, generate tags, and create a summary for you!",
      {
        link_preview_options: {
          is_disabled: true,
        },
      },
    );
  } catch (error) {
    console.error("Login error:", error);
    await ctx.reply(
      "An error occurred during login. Please try again.\n\n" +
        "If the problem persists, please contact support at @quiker.",
    );
  }
}
