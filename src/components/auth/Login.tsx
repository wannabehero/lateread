export const Login = () => (
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
);
