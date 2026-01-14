interface LoginProps {
  back?: string;
}

export const Login = ({ back }: LoginProps) => {
  const loginUrl = back
    ? `/auth/telegram?back=${encodeURIComponent(back)}`
    : "/auth/telegram";

  return (
    <div class="auth-container">
      <header>
        <h1>Welcome to lateread</h1>
        <p>Save articles via Telegram, read them anywhere.</p>
      </header>

      <div id="auth-content">
        <button
          class="contrast"
          type="button"
          hx-post={loginUrl}
          hx-target="#auth-content"
          hx-swap="outerHTML"
        >
          Login with Telegram
        </button>
      </div>
    </div>
  );
};
