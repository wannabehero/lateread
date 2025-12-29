import { Hono } from "hono";
import { ArticleList } from "../components/ArticleList";
import { Layout } from "../components/Layout";
import { getSession } from "../lib/session";
import { getArticlesWithTags } from "../services/articles.service";
import type { AppContext } from "../types/context";

const home = new Hono<AppContext>();

/**
 * GET / - Home/Login page or article list if authenticated
 */
home.get("/", async (c) => {
  const session = getSession(c);

  // If authenticated, show article list (all non-archived articles)
  if (session?.userId) {
    try {
      const articlesWithTags = await getArticlesWithTags(session.userId, {
        archived: false,
      });

      return c.html(
        <Layout isAuthenticated={true}>
          <ArticleList articles={articlesWithTags} archived={false} />
        </Layout>,
      );
    } catch (error) {
      console.error("Error loading articles:", error);
      return c.html(
        <Layout isAuthenticated={true}>
          <div class="error">
            <p>Failed to load articles. Please try again.</p>
          </div>
        </Layout>,
        500,
      );
    }
  }

  // Show login page
  return c.html(
    <Layout>
      <div class="auth-container">
        <header>
          <h1>Welcome to lateread</h1>
          <p>Save articles via Telegram, read them anywhere.</p>
        </header>

        <div id="auth-content">
          <button
            class="contrast"
            type="button"
            hx-post="/auth/telegram"
            hx-target="#auth-content"
            hx-swap="outerHTML"
          >
            Login with Telegram
          </button>
        </div>
      </div>
    </Layout>,
  );
});

export default home;
