import { Bot } from "grammy";
import { config } from "../lib/config";

// Create bot instance
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Bot username from config
export const botUsername = config.BOT_USERNAME;

/**
 * Initialize bot with middleware and handlers
 * Handlers will be registered separately
 */
export function setupBot() {
  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  console.log(`Bot initialized: @${botUsername}`);
}

/**
 * Start bot polling
 */
export async function startBot() {
  try {
    await bot.start();
    console.log("Bot polling started");
  } catch (error) {
    console.error("Failed to start bot:", error);
    throw error;
  }
}

/**
 * Stop bot polling
 */
export async function stopBot() {
  try {
    await bot.stop();
    console.log("Bot stopped");
  } catch (error) {
    console.error("Failed to stop bot:", error);
  }
}
