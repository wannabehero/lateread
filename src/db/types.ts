import type * as schema from "./schema";

export type Article = typeof schema.articles.$inferSelect;
export type Tag = typeof schema.tags.$inferSelect;
