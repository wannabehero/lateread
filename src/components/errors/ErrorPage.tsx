import type { FC } from "hono/jsx";
import { Layout } from "../Layout";

interface ErrorPageProps {
  statusCode: number;
  message: string;
}

/**
 * Full-page error display (for non-HTMX requests)
 *
 * Shows error with full page layout, home link, and optional retry button
 */
export const ErrorPage: FC<ErrorPageProps> = ({ statusCode, message }) => {
  return (
    <Layout title={`Error ${statusCode}`} isAuthenticated={false}>
      <div class="error-page">
        <h1>{statusCode}</h1>
        <p class="error-message">{message}</p>
      </div>
    </Layout>
  );
};
