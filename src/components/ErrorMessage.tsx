import type { FC } from "hono/jsx";

interface ErrorMessageProps {
  message: string;
  retryButton?: {
    text: string;
    action: string;
    method?: "get" | "post";
  };
}

export const ErrorMessage: FC<ErrorMessageProps> = ({
  message,
  retryButton,
}) => {
  return (
    <div class="error">
      <p>{message}</p>
      {retryButton && (
        <button
          type="button"
          {...(retryButton.method === "post"
            ? { "hx-post": retryButton.action }
            : { "hx-get": retryButton.action })}
          hx-swap="outerHTML"
        >
          {retryButton.text}
        </button>
      )}
    </div>
  );
};
