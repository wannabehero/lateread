import { Hono } from "hono";
import { Layout } from "../components/Layout";
import { SearchPage, SearchResults } from "../components/SearchPage";
import { requireAuth } from "../middleware/auth";
import { getArticlesWithTags } from "../services/articles.service";
import type { AppContext } from "../types/context";

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

  // Full page render
  const title = query ? `Search: "${query}"` : "Search";
  return c.html(
    <Layout title={title} isAuthenticated={true}>
      <SearchPage query={query} articles={articles} />
    </Layout>,
  );
});

export default searchRouter;
