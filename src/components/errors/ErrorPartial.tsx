import type { FC } from "hono/jsx";

interface ErrorPartialProps {
	message: string;
	retryable?: boolean;
	retryUrl?: string;
}

/**
 * Partial error display (for HTMX swaps)
 *
 * Shows inline error message with optional retry button
 * Used when HTMX requests fail - swaps into target element
 */
export const ErrorPartial: FC<ErrorPartialProps> = ({
	message,
	retryable,
	retryUrl,
}) => {
	return (
		<div class="error-partial" role="alert">
			<p class="error-message">{message}</p>
			{retryable && retryUrl && (
				<button
					type="button"
					hx-get={retryUrl}
					hx-swap="outerHTML"
					class="button small"
				>
					Retry
				</button>
			)}
		</div>
	);
};
