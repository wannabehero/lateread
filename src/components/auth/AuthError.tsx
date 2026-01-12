import type { FC } from "hono/jsx";

interface AuthErrorProps {
  message: string;
  buttonText?: string;
  back?: string;
}

export const AuthError: FC<AuthErrorProps> = ({
  message,
  buttonText = "Try Again",
  back,
}) => {
  const loginUrl = back ? `/auth/telegram?back=${encodeURIComponent(back)}` : "/auth/telegram";

  return (
    <div id="auth-content">
      <p style="color: var(--del-color);">{message}</p>
      <button
        class="contrast"
        type="button"
        hx-post={loginUrl}
        hx-target="#auth-content"
        hx-swap="outerHTML"
      >
        {buttonText}
      </button>
    </div>
  );
};
