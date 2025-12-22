import { Hono } from "hono";
import { Layout } from "../components/Layout";
import { ArticleList } from "../components/ArticleList";
import { AuthError } from "../components/auth/AuthError";
import { AuthPolling } from "../components/auth/AuthPolling";
import {
  createAuthToken,
  getAuthTokenStatus,
  TOKEN_EXPIRATION_MINUTES,
} from "../lib/auth";
import { config } from "../lib/config";
import { clearSession, getSession, setSession } from "../lib/session";
import { getArticlesWithTags } from "../services/articles.service";

const auth = new Hono();

/**
 * GET / - Home/Login page or article list if authenticated
 */
auth.get("/", async (c) => {
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
        </Layout>
      );
    } catch (error) {
      console.error("Error loading articles:", error);
      return c.html(
        <Layout title="Error - lateread" isAuthenticated={true}>
          <div class="error">
            <p>Failed to load articles. Please try again.</p>
          </div>
        </Layout>,
        500
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

/**
 * POST /auth/telegram - Create auth token and return HTMX fragment
 */
auth.post("/auth/telegram", async (c) => {
  try {
    const result = await createAuthToken();

    // Return HTMX fragment with polling
    return c.html(
      <div id="auth-content">
        <h3>Complete authentication in Telegram</h3>

        <a href={result.telegramUrl} target="_blank" class="contrast">
          Open Telegram to Login
        </a>

        <p class="help-text">
          <small>
            Opens @{config.BOT_USERNAME} and completes authentication
            automatically
          </small>
        </p>

        <p class="help-text">
          <small>Token expires in {TOKEN_EXPIRATION_MINUTES} minutes</small>
        </p>

        {/* Polling element - checks auth status every 2 seconds */}
        <AuthPolling token={result.token} immediate={true} />
      </div>,
    );
  } catch (error) {
    console.error("Error creating auth token:", error);
    return c.html(
      <AuthError message="Failed to create authentication session. Please try again." />,
      500,
    );
  }
});

/**
 * GET /auth/check/:token - Check auth token status and return HTMX fragment
 */
auth.get("/auth/check/:token", async (c) => {
  const token = c.req.param("token");

  try {
    const status = await getAuthTokenStatus(token);

    if (status.status === "success") {
      // Set session cookie
      setSession(c, { userId: status.userId });

      // Use hx-redirect header to trigger client-side redirect
      c.header("hx-redirect", "/");

      return c.html(
        <div id="auth-polling">
          <p>Authentication successful! Redirecting...</p>
        </div>,
      );
    }

    if (status.status === "expired") {
      // Token expired - show error
      return c.html(
        <AuthError
          message="Authentication session expired. Please try again."
          buttonText="Login with Telegram"
        />,
      );
    }

    // Still pending - continue polling
    return c.html(<AuthPolling token={token} />);
  } catch (error) {
    console.error("Error checking auth token:", error);
    return c.html(
      <AuthError message="An error occurred. Please try again." />,
      500,
    );
  }
});

/**
 * POST /auth/logout - Clear session
 */
auth.post("/auth/logout", (c) => {
  clearSession(c);
  return c.redirect("/");
});

export default auth;
