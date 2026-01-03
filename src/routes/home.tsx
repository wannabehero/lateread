import { Hono } from "hono";
import { Login } from "../components/auth/Login";
import type { AppContext } from "../types/context";
import { renderArticlesList } from "./articles";
import { renderWithLayout } from "./utils/render";

const home = new Hono<AppContext>();

/**
 * GET / - Home/Login page or article list if authenticated
 */
home.get("/", async (c) => {
  const userId = c.get("userId");

  // If authenticated, show article list
  if (userId) {
    return renderArticlesList(c);
  }

  return renderWithLayout({
    c,
    content: <Login />,
  });
});

export default home;
