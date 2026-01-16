import type { ValidationTargets } from "hono";
import { validator as honoValidator } from "hono/validator";
import type { z } from "zod";
import { ValidationError } from "./errors";

/**
 * Custom validator middleware using Hono's validator with Zod integration.
 *
 * Provides:
 * - Type-safe validation using Zod schemas
 * - Integration with custom error handling (throws ValidationError)
 * - Consistent error response format
 *
 * Usage:
 * ```typescript
 * import { validator } from "../lib/validator";
 * import { z } from "zod";
 *
 * const schema = z.object({ id: z.string().uuid() });
 *
 * router.get("/articles/:id",
 *   validator("param", schema),
 *   async (c) => {
 *     const { id } = c.req.valid("param");
 *   }
 * );
 * ```
 */
export function validator<
  Target extends keyof ValidationTargets,
  Schema extends z.ZodType<unknown>,
>(target: Target, schema: Schema) {
  return honoValidator(target as keyof ValidationTargets, async (value) => {
    const result = await schema.safeParseAsync(value);

    if (!result.success) {
      const issues = result.error.issues;
      const errors = issues.reduce(
        (acc, e) => {
          acc[e.path.join(".") || "_root"] = e.message;
          return acc;
        },
        {} as Record<string, string>,
      );

      throw new ValidationError("Validation failed", {
        target,
        errors,
      } as unknown as Record<string, string>);
    }

    return result.data as z.output<Schema>;
  });
}
