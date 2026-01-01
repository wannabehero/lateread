import type * as schema from "./schema";

export type Article = typeof schema.articles.$inferSelect;
export type Tag = typeof schema.tags.$inferSelect;
export type Subscription = typeof schema.subscriptions.$inferSelect;
export type ArticleStatus = (typeof schema.articleStatus)[number];
export type SubscriptionType = (typeof schema.subscriptionType)[number];

// User Preferences TypeScript interfaces
export interface ReaderPreferences {
  fontFamily: "sans" | "serif" | "new-york";
  fontSize: number; // 14-24px
}

export interface UserPreferences {
  reader?: ReaderPreferences;
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontFamily: "sans",
  fontSize: 18,
};
