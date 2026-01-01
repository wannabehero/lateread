import { and, eq, gt } from "drizzle-orm";
import { subscriptions } from "../db/schema";
import type { SubscriptionType } from "../db/types";
import { db } from "../lib/db";

const SUMMARY_ENABLED_TYPES: SubscriptionType[] = ["full", "lite"];
const TTS_ENABLED_TYPES: SubscriptionType[] = ["full"];

interface AllowedFeatures {
  summary: boolean;
  tts: boolean;
}

async function findActiveSubscriptionForUser(userId: string) {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        gt(subscriptions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return subscription ?? null;
}

export async function getAllowedFeaturesForUser(
  userId: string,
): Promise<AllowedFeatures> {
  const subscription = await findActiveSubscriptionForUser(userId);

  if (!subscription) {
    return {
      summary: false,
      tts: false,
    };
  }

  return {
    summary: SUMMARY_ENABLED_TYPES.includes(subscription.type),
    tts: TTS_ENABLED_TYPES.includes(subscription.type),
  };
}
