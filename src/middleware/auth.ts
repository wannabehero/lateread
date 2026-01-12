import type { Context, Next } from "hono";
import type { AppContext } from "../types/context";

type AuthStrategy = "redirect" | "json-401";

/**
 * Authentication middleware
 *
 * @param strategy - "redirect" for page routes (redirects to /login?back=...), "json-401" for API routes (returns 401)
 *
 * Usage:
 * - Page routes: app.get("/articles", requireAuth("redirect"), handler)
 * - API routes: app.post("/api/articles/:id", requireAuth("json-401"), handler)
 *
 * Expects `userId` to be set in the context, e.g. via session() middleware
 */
export function requireAuth(strategy: AuthStrategy = "redirect") {
  return async (c: Context<AppContext>, next: Next) => {
    const userId = c.get("userId");

    if (!userId) {
      if (strategy === "json-401") {
        return c.json({ error: "Unauthorized" }, 401);
      }
      // strategy === "redirect"
      const currentPath = c.req.path;
      return c.redirect(`/login?back=${encodeURIComponent(currentPath)}`);
    }

    await next();
  };
}
