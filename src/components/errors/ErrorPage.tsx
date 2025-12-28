import type { FC } from "hono/jsx";
import { Layout } from "../Layout";

interface ErrorPageProps {
	statusCode: number;
	message: string;
	retryUrl?: string;
}

/**
 * Full-page error display (for non-HTMX requests)
 *
 * Shows error with full page layout, home link, and optional retry button
 */
export const ErrorPage: FC<ErrorPageProps> = ({
	statusCode,
	message,
	retryUrl,
}) => {
	return (
		<Layout title={`Error ${statusCode}`} isAuthenticated={false}>
			<div class="error-page">
				<h1>{statusCode}</h1>
				<p>{message}</p>
				<div class="button-group">
					{retryUrl && (
						<a href={retryUrl} class="button">
							Try Again
						</a>
					)}
					<a href="/" class="button secondary">
						Go Home
					</a>
				</div>
			</div>
		</Layout>
	);
};
