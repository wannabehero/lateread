import { Bot } from "grammy";
import { config } from "../lib/config";
import { registerHandlers } from "./handlers";

// Create bot instance
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Bot username from config
export const botUsername = config.BOT_USERNAME;

/**
 * Start bot polling
 */
export async function startBot() {
  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  registerHandlers(bot);
  console.log(`Bot initialized: @${botUsername}`);

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
