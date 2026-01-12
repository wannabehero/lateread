import type { Context, NextFunction } from "grammy";
import { config } from "../../lib/config";

/**
 * Middleware to restrict access to super admin only
 */
export const onlySuperAdmin = async (ctx: Context, next: NextFunction) => {
  // If no admin ID is configured, block everything for security
  if (!config.ADMIN_TELEGRAM_ID) {
    return;
  }

  // Check if sender matches admin ID
  if (ctx.from?.id !== config.ADMIN_TELEGRAM_ID) {
    return;
  }

  await next();
};
