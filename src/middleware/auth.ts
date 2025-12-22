import type { Context, Next } from "hono";
import { getSession } from "../lib/session";
import type { AppContext } from "../types/context";

type AuthStrategy = "redirect" | "json-401";

/**
 * Authentication middleware
 *
 * @param strategy - "redirect" for page routes (redirects to /), "json-401" for API routes (returns 401)
 *
 * Usage:
 * - Page routes: app.get("/articles", requireAuth("redirect"), handler)
 * - API routes: app.post("/api/articles/:id", requireAuth("json-401"), handler)
 *
 * Sets c.get("userId") for use in route handlers (typed via AppContext)
 */
export function requireAuth(strategy: AuthStrategy = "redirect") {
  return async (c: Context<AppContext>, next: Next) => {
    const session = getSession(c);

    if (!session?.userId) {
      if (strategy === "json-401") {
        return c.json({ error: "Unauthorized" }, 401);
      }
      // strategy === "redirect"
      return c.redirect("/");
    }

    // Make userId available to route handlers via context
    c.set("userId", session.userId);
    await next();
  };
}
