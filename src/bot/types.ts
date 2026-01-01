import type { Context } from "grammy";
import type { Logger } from "../lib/logger";

interface LoggingFlavor {
  logger: Logger;
}

export type BotContext = Context & LoggingFlavor;
