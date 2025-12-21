import type { FC } from "hono/jsx";

interface AuthErrorProps {
  message: string;
  buttonText?: string;
}

export const AuthError: FC<AuthErrorProps> = ({
  message,
  buttonText = "Try Again",
}) => {
  return (
    <div id="auth-content">
      <p style="color: var(--del-color);">{message}</p>
      <button
        class="contrast"
        type="button"
        hx-post="/auth/telegram"
        hx-target="#auth-content"
        hx-swap="outerHTML"
      >
        {buttonText}
      </button>
    </div>
  );
};
