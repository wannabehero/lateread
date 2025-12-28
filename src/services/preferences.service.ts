import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderPreferences,
  type UserPreferences,
} from "../db/types";
import { db } from "../lib/db";

/**
 * Get all user preferences (parsed from JSON column)
 */
export async function getUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  const [user] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  try {
    return JSON.parse(user.preferences || "{}");
  } catch {
    return {};
  }
}

/**
 * Get reader-specific preferences with defaults
 */
export async function getReaderPreferences(
  userId: string,
): Promise<ReaderPreferences> {
  const prefs = await getUserPreferences(userId);
  return { ...DEFAULT_READER_PREFERENCES, ...prefs.reader };
}

/**
 * Update reader preferences (merge with existing)
 */
export async function updateReaderPreferences(
  userId: string,
  readerPrefs: Partial<ReaderPreferences>,
): Promise<void> {
  const currentPrefs = await getUserPreferences(userId);

  const updatedPrefs: UserPreferences = {
    ...currentPrefs,
    reader: {
      ...DEFAULT_READER_PREFERENCES,
      ...currentPrefs.reader,
      ...readerPrefs,
    },
  };

  await db
    .update(users)
    .set({ preferences: JSON.stringify(updatedPrefs) })
    .where(eq(users.id, userId));
}
