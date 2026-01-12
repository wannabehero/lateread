import { Hono } from "hono";
import { z } from "zod";
import { SearchPage, SearchResults } from "../components/SearchPage";
import { validator } from "../lib/validator";
import { requireAuth } from "../middleware/auth";
import { getArticlesWithTags } from "../services/articles.service";
import type { AppContext } from "../types/context";
import { renderWithLayout } from "./utils/render";

const searchRouter = new Hono<AppContext>();

/**
 * GET /search - Search all articles
 */
searchRouter.get(
  "/search",
  requireAuth("redirect"),
  validator(
    "query",
    z.object({
      q: z.string().trim().max(500, "Search query too long").optional(),
    }),
  ),
  async (c) => {
    const userId = c.get("userId");
    const { q: query } = c.req.valid("query");

    const articles = query ? await getArticlesWithTags(userId, { query }) : [];

    if (
      c.req.header("hx-request") === "true" &&
      c.req.header("hx-target") === "search-results"
    ) {
      return c.html(<SearchResults articles={articles} query={query} />);
    }

    return renderWithLayout({
      c,
      content: <SearchPage query={query} articles={articles} />,
    });
  },
);

export default searchRouter;
