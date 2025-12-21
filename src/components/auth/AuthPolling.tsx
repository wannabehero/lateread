import type { FC } from "hono/jsx";

interface AuthPollingProps {
  token: string;
  message?: string;
  immediate?: boolean;
}

export const AuthPolling: FC<AuthPollingProps> = ({
  token,
  message = "Waiting for Telegram authentication...",
  immediate = false,
}) => {
  // Initial polling: check immediately and every 2s
  // Continuation polling: wait 2s then check (single shot, will replace itself)
  const trigger = immediate ? "load, every 2s" : "load delay:2s";

  return (
    <div
      id="auth-polling"
      hx-get={`/auth/check/${token}`}
      hx-trigger={trigger}
      hx-target="#auth-polling"
      hx-swap="outerHTML"
    >
      <p aria-busy="true">{message}</p>
    </div>
  );
};
