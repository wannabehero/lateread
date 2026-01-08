import type { Context, Env, MiddlewareHandler, ValidationTargets } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { ValidationError } from "./errors";

/**
 * Custom validator using Hono's validator with Zod integration.
 *
 * This wrapper provides:
 * - Type-safe validation using Zod schemas
 * - Integration with our custom error handling (throws ValidationError)
 * - Consistent error response format
 *
 * Usage:
 * ```typescript
 * import { zValidator, schemas } from "../lib/validator";
 *
 * router.get("/articles/:id",
 *   zValidator("param", schemas.articleId),
 *   async (c) => {
 *     const { id } = c.req.valid("param");
 *     // id is typed as string
 *   }
 * );
 * ```
 */
export function zValidator<
  Target extends keyof ValidationTargets,
  Schema extends z.ZodType<unknown>,
  E extends Env = Env,
>(
  target: Target,
  schema: Schema,
): MiddlewareHandler<
  E,
  string,
  {
    in: { [K in Target]: z.input<Schema> };
    out: { [K in Target]: z.output<Schema> };
  }
> {
  return validator(target, (value, _c: Context) => {
    const result = schema.safeParse(value);

    if (!result.success) {
      // Zod v4 uses 'issues' property on ZodError
      const issues = result.error.issues;
      const errors = issues.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      }));

      throw new ValidationError("Validation failed", {
        target,
        errors: errors.reduce(
          (acc, err) => {
            acc[err.path || "_root"] = err.message;
            return acc;
          },
          {} as Record<string, string>,
        ),
      });
    }

    return result.data as z.output<Schema>;
  });
}

/**
 * Common validation schemas for reuse across routes.
 */
export const schemas = {
  /**
   * UUID article ID parameter
   */
  articleId: z.object({
    id: z.string().uuid("Invalid article ID format"),
  }),

  /**
   * Auth token parameter
   */
  authToken: z.object({
    token: z.string().min(1, "Token is required"),
  }),

  /**
   * Articles list query parameters
   */
  articlesQuery: z.object({
    status: z
      .enum(["all", "archived"], {
        message: "Status must be 'all' or 'archived'",
      })
      .optional()
      .default("all"),
    tag: z.string().min(1, "Tag cannot be empty").optional(),
  }),

  /**
   * Archive endpoint query parameters
   */
  archiveQuery: z.object({
    redirect: z
      .enum(["true", "false"], {
        message: "Redirect must be 'true' or 'false'",
      })
      .optional()
      .transform((val) => val === "true"),
  }),

  /**
   * Search query parameters
   */
  searchQuery: z.object({
    q: z.string().max(500, "Search query too long").optional(),
  }),

  /**
   * Reader preferences form data
   */
  readerPreferences: z.object({
    fontFamily: z.enum(["sans", "serif", "new-york"], {
      message: "Font family must be 'sans', 'serif', or 'new-york'",
    }),
    fontSize: z.coerce
      .number({
        message: "Font size must be a number",
      })
      .int("Font size must be a whole number")
      .min(14, "Font size must be at least 14")
      .max(24, "Font size must be at most 24"),
  }),
};

/**
 * Inferred types from schemas for use in services/components
 */
export type ArticlesQuery = z.infer<typeof schemas.articlesQuery>;
export type ArchiveQuery = z.infer<typeof schemas.archiveQuery>;
export type SearchQuery = z.infer<typeof schemas.searchQuery>;
export type ReaderPreferences = z.infer<typeof schemas.readerPreferences>;
