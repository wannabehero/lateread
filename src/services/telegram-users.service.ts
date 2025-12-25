import { eq } from "drizzle-orm";
import { db, telegramUsers } from "../lib/db";

/**
 * Get telegram user by telegram ID
 */
export async function getTelegramUserByTelegramId(
  telegramId: string,
): Promise<{ id: string; userId: string } | null> {
  const [telegramUser] = await db
    .select()
    .from(telegramUsers)
    .where(eq(telegramUsers.telegramId, telegramId))
    .limit(1);

  return telegramUser || null;
}
