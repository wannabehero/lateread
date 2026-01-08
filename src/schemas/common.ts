import { z } from "zod";

/**
 * Common validation schema for article ID path parameter.
 * Used across multiple routes: /articles/:id, /api/articles/:id/*
 */
export const articleIdParam = z.object({
  id: z.string().uuid("Invalid article ID format"),
});
