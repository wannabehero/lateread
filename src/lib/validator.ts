import type { Context, Env, MiddlewareHandler, ValidationTargets } from "hono";
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
  return honoValidator(target, async (value, _c: Context) => {
    const result = await schema.safeParseAsync(value);

    if (!result.success) {
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
