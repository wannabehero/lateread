import { Hono } from "hono";
import { AuthError } from "../components/auth/AuthError";
import { AuthPolling } from "../components/auth/AuthPolling";
import {
  createAuthToken,
  getAuthTokenStatus,
  TOKEN_EXPIRATION_MINUTES,
} from "../lib/auth";
import { config } from "../lib/config";
import { clearSession, getSession, setSession } from "../lib/session";

const auth = new Hono();

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
