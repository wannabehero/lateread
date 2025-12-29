import { Hono } from "hono";
import { AuthError } from "../components/auth/AuthError";
import { AuthPolling } from "../components/auth/AuthPolling";
import {
  createAuthToken,
  getAuthTokenStatus,
  TOKEN_EXPIRATION_MINUTES,
} from "../lib/auth";
import { config } from "../lib/config";
import { clearSession, setSession } from "../lib/session";
import type { AppContext } from "../types/context";

const auth = new Hono<AppContext>();

/**
 * POST /auth/telegram - Create auth token and return HTMX fragment
 */
auth.post("/auth/telegram", async (c) => {
  const result = await createAuthToken();

  // Return HTMX fragment with polling
  return c.html(
    <div
      id="auth-content"
      hx-on--after-settle={`if(event.detail.elt===this)open('${result.telegramUrl}','_blank')`}
    >
      <p>
        <a href={result.telegramUrl} target="_blank">
          Proceed to Telegram to Login
        </a>
        <br />
        <small>
          Opens @{config.BOT_USERNAME} and completes authentication
          automatically
        </small>
        <br />
        <small>Link expires in {TOKEN_EXPIRATION_MINUTES} minutes</small>
      </p>

      {/* Polling element - checks auth status every 2 seconds */}
      <AuthPolling token={result.token} immediate={true} />
    </div>,
  );
});

/**
 * GET /auth/check/:token - Check auth token status and return HTMX fragment
 */
auth.get("/auth/check/:token", async (c) => {
  const token = c.req.param("token");

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
});

/**
 * POST /auth/logout - Clear session
 */
auth.post("/auth/logout", (c) => {
  clearSession(c);
  return c.redirect("/");
});

export default auth;
