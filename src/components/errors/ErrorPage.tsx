import type { FC } from "hono/jsx";

interface ErrorPageProps {
  statusCode: number;
  message: string;
}

export const ErrorPage: FC<ErrorPageProps> = ({ statusCode, message }) => {
  return (
    <div class="error-page">
      <h1>{statusCode}</h1>
      <p class="error-message">{message}</p>
    </div>
  );
};
