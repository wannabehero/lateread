import { Hono } from "hono";
import type { AppContext } from "../types/context";
import { Layout } from "../components/Layout";
import { ArticleList } from "../components/ArticleList";
import { getSession } from "../lib/session";
import { getArticlesWithTags } from "../services/articles.service";
import { config } from "../lib/config";

const home = new Hono<AppContext>();

/**
 * GET / - Home/Login page or article list if authenticated
 */
home.get("/", async (c) => {
  const session = getSession(c);

  // If authenticated, show article list (unread articles)
  if (session?.userId) {
    try {
      const articlesWithTags = await getArticlesWithTags(session.userId, {
        archived: false,
      });

      return c.html(
        <Layout
          title="Unread Articles - lateread"
          isAuthenticated={true}
          currentPath="/"
        >
          <ArticleList articles={articlesWithTags} status="unread" />
        </Layout>,
      );
    } catch (error) {
      console.error("Error loading articles:", error);
      return c.html(
        <Layout title="Error - lateread" isAuthenticated={true}>
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
    <Layout title="Login - lateread">
      <article class="auth-container">
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
          <p class="help-text">
            <small>
              You'll be redirected to Telegram to complete authentication
            </small>
          </p>
        </div>
      </article>
    </Layout>,
  );
});

export default home;
