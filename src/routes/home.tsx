import { Hono } from "hono";
import type { AppContext } from "../types/context";
import { renderArticlesList } from "./articles";

const home = new Hono<AppContext>();

/**
 * GET / - Home page. Redirects to /login if not authenticated.
 */
home.get("/", async (c) => {
  const userId = c.get("userId");

  // If authenticated, show non-archived article list
  if (userId) {
    return renderArticlesList(c, userId);
  }

  // Not authenticated, redirect to login
  return c.redirect("/login");
});

export default home;
