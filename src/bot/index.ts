import { Bot } from "grammy";
import { config } from "../lib/config";
import { defaultLogger } from "../lib/logger";
import { registerHandlers } from "./handlers";
import type { BotContext } from "./types";

export const bot = new Bot<BotContext>(config.TELEGRAM_BOT_TOKEN);

const logger = defaultLogger.child({ module: "bot" });

/**
 * Start bot polling
 */
export async function startBot() {
  bot.catch((error) => {
    logger.error("Bot error:", { error });
  });

  registerHandlers(bot);

  try {
    await bot.start();
  } catch (error) {
    logger.error("Failed to start bot", { error });
    throw error;
  }
}

/**
 * Stop bot polling
 */
export async function stopBot() {
  try {
    await bot.stop();
  } catch (error) {
    logger.error("Failed to stop bot", { error });
  }
}
