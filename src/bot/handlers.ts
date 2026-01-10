import type { Bot, Context } from "grammy";
import { config } from "../lib/config";
import { contentCache } from "../lib/content-cache";
import { defaultLogger } from "../lib/logger";
import { addArticleJob } from "../lib/queue";
import { createArticle } from "../services/articles.service";
import { claimAuthToken } from "../services/auth.service";
import { getTelegramUserByTelegramId } from "../services/telegram-users.service";
import { extractMessageMetadata, extractUrl } from "./helpers";
import type { BotContext } from "./types";

/**
 * Register all bot command handlers
 */
export function registerHandlers(bot: Bot<BotContext>) {
  bot.use(async (ctx, next) => {
    ctx.logger = defaultLogger.child({
      chat: ctx.chatId,
      user: ctx.from?.id,
      messageId: ctx.message?.message_id,
      module: "bot",
    });
    await next();
  });

  // /start command - welcome message or handle deep link login
  bot.command("start", async (ctx) => {
    const startPayload = ctx.match;

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
        "2. Send me any URL or long message to save it automatically\n\n",
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

    // Authenticate user
    const telegramUser = await authenticateTelegramUser(ctx);
    if (!telegramUser) {
      return;
    }

    // Get text or caption from message
    const messageText = getMessageText(ctx);

    ctx.logger.info("Received message", {
      snippet: messageText.substring(0, 64),
      user: telegramUser.userId,
    });

    // Check if message is long enough to treat as article
    if (messageText.length >= config.LONG_MESSAGE_THRESHOLD) {
      ctx.logger.info("Message length >= threshold treating as article", {
        length: messageText.length,
        threshold: config.LONG_MESSAGE_THRESHOLD,
      });
      await handleLongMessage(ctx, telegramUser);
      return;
    }

    const url = extractUrl(messageText);

    if (!url) {
      ctx.logger.info("No URL found in message, ignoring");
      return;
    }

    ctx.logger.info("Creating article record for URL", {
      url,
    });
    const article = await createArticle({
      userId: telegramUser.userId,
      url: url,
    });

    ctx.logger.info("Article created", { article: article.id });

    await queueArticleForProcessing(ctx, article.id);
  });
}

/**
 * Authenticate a Telegram user from context
 * Returns telegramUser if authenticated, null otherwise (sends error message to user)
 */
async function authenticateTelegramUser(ctx: BotContext) {
  const telegramId = ctx.from?.id.toString();

  if (!telegramId) {
    ctx.logger.info("No telegram ID found, ignoring");
    return null;
  }

  const telegramUser = await getTelegramUserByTelegramId(telegramId);

  if (!telegramUser) {
    ctx.logger.info("User not authenticated", { telegramId });
    await ctx.reply(
      "Please log in first at the web app to start saving articles.\n\n" +
        "Once you're logged in, send me any URL or long message and I'll save it for you.\n\n" +
        "Log in here: https://lateread.app/",
    );
    return null;
  }

  ctx.logger.info("User authenticated", {
    user: telegramUser.userId,
    telegramId,
  });

  return telegramUser;
}

/**
 * Extract text or caption from message
 */
function getMessageText(ctx: Context): string {
  if (!ctx.message) {
    return "";
  }

  return (
    ("text" in ctx.message && ctx.message.text) ||
    ("caption" in ctx.message && ctx.message.caption) ||
    ""
  );
}

/**
 * Add article to processing queue
 */
async function queueArticleForProcessing(
  ctx: BotContext,
  articleId: string,
): Promise<void> {
  try {
    await ctx.react("👀");
  } catch (error) {
    ctx.logger.error("Failed to add reaction", { error });
  }

  ctx.logger.info("Adding article to queue", { article: articleId });
  addArticleJob(articleId);
}

/**
 * Handle long Telegram messages as articles
 */
async function handleLongMessage(
  ctx: BotContext,
  telegramUser: { userId: string },
) {
  // Extract metadata from message
  const metadata = await extractMessageMetadata(ctx);

  if (!metadata) {
    ctx.logger.error("Failed to extract message metadata");
    return;
  }

  const { title, description, url, siteName, htmlContent } = metadata;

  ctx.logger.info("Processing long message", {
    title,
    url,
  });

  ctx.logger.info("Creating article record for long message");
  const article = await createArticle({
    userId: telegramUser.userId,
    url: url,
    title: title,
    description: description,
    siteName: siteName,
  });

  ctx.logger.info("Article created with ID", { article: article.id });

  // Cache HTML content immediately
  try {
    await contentCache.set(telegramUser.userId, article.id, htmlContent);
    ctx.logger.info("Content cached for article", { article: article.id });
  } catch (error) {
    ctx.logger.error("Failed to cache content for article", {
      error,
      article: article.id,
    });
    // Continue anyway - worker will retry if needed
  }

  // Process with worker
  await queueArticleForProcessing(ctx, article.id);
}

/**
 * Handle login authentication flow
 */
async function handleLogin(ctx: BotContext, token: string) {
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
    ctx.logger.error("Login error", { error });
    await ctx.reply(
      "An error occurred during login. Please try again.\n\n" +
        "If the problem persists, please contact support at @quiker.",
    );
  }
}
