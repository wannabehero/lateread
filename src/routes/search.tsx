import { Hono } from "hono";
import { z } from "zod";
import { ArticleCards } from "../components/ArticleCards";
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
      cursor: z.string().optional(),
    }),
  ),
  async (c) => {
    const userId = c.get("userId");
    const { q: query, cursor } = c.req.valid("query");

    const result = query
      ? await getArticlesWithTags(userId, { query, cursor })
      : { articles: [], nextCursor: null, hasMore: false };

    // HTMX partial response for pagination (load more)
    if (c.req.header("hx-request") === "true" && cursor) {
      return c.html(
        <ArticleCards
          articles={result.articles}
          nextCursor={result.nextCursor}
          basePath="/search"
          searchQuery={query}
        />,
      );
    }

    // HTMX partial response for search results update
    if (
      c.req.header("hx-request") === "true" &&
      c.req.header("hx-target") === "search-results"
    ) {
      return c.html(
        <SearchResults
          articles={result.articles}
          query={query}
          nextCursor={result.nextCursor}
        />,
      );
    }

    return renderWithLayout({
      c,
      content: (
        <SearchPage
          query={query}
          articles={result.articles}
          nextCursor={result.nextCursor}
        />
      ),
    });
  },
);

export default searchRouter;
