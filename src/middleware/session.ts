import type { Context, Next } from "hono";
import { getSession } from "../lib/session";
import type { AppContext } from "../types/context";

export function session() {
  return async (c: Context<AppContext>, next: Next) => {
    const session = getSession(c);

    if (session?.userId) {
      c.set("userId", session.userId);
    }

    await next();
  };
}
