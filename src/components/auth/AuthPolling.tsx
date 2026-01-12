import type { FC } from "hono/jsx";

interface AuthPollingProps {
  token: string;
  message?: string;
  immediate?: boolean;
  back?: string;
}

export const AuthPolling: FC<AuthPollingProps> = ({
  token,
  message = "Waiting for authentication...",
  immediate = false,
  back,
}) => {
  // Initial polling: check immediately and every 2s
  // Continuation polling: wait 2s then check (single shot, will replace itself)
  const trigger = immediate ? "load, every 2s" : "load delay:2s";

  const checkUrl = back
    ? `/auth/check/${token}?back=${encodeURIComponent(back)}`
    : `/auth/check/${token}`;

  return (
    <div
      id="auth-polling"
      hx-get={checkUrl}
      hx-trigger={trigger}
      hx-target="#auth-polling"
      hx-swap="outerHTML"
    >
      <p aria-busy="true">{message}</p>
      <p>
        <button
          type="button"
          hx-get={checkUrl}
          hx-target="#auth-polling"
          hx-swap="outerHTML"
        >
          Click here if you completed the login
        </button>
        <br />
        <small>Or wait for automatic verification</small>
      </p>
    </div>
  );
};
