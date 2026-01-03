import { Hono } from "hono";
import { SearchPage, SearchResults } from "../components/SearchPage";
import { requireAuth } from "../middleware/auth";
import { getArticlesWithTags } from "../services/articles.service";
import type { AppContext } from "../types/context";
import { renderWithLayout } from "./utils/render";

const searchRouter = new Hono<AppContext>();
/**
 * GET /search - Search all articles
 */
searchRouter.get("/search", requireAuth("redirect"), async (c) => {
  const userId = c.get("userId");
  const query = c.req.query("q");

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
});

export default searchRouter;
