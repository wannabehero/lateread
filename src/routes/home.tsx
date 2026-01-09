import { Hono } from "hono";
import { z } from "zod";
import { Login } from "../components/auth/Login";
import { validator } from "../lib/validator";
import type { AppContext } from "../types/context";
import { renderArticlesList } from "./articles";
import { renderWithLayout } from "./utils/render";

const home = new Hono<AppContext>();

/**
 * GET / - Home/Login page or article list if authenticated
 */
home.get(
  "/",
  validator(
    "query",
    z.object({
      status: z
        .enum(["all", "archived"], {
          message: "Status must be 'all' or 'archived'",
        })
        .optional()
        .default("all"),
      tag: z
        .string()
        .trim()
        .min(1, "Tag cannot be empty")
        .toLowerCase()
        .optional(),
    }),
  ),
  async (c) => {
    const userId = c.get("userId");

    // If authenticated, show article list
    if (userId) {
      return renderArticlesList(c);
    }

    return renderWithLayout({
      c,
      content: <Login />,
    });
  },
);

export default home;
