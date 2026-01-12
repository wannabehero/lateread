import type { FC } from "hono/jsx";

interface EmptyStateProps {
  archived?: boolean;
}

export const EmptyState: FC<EmptyStateProps> = ({ archived }) => {
  const message = archived
    ? "No archived articles yet"
    : "No articles yet. Forward a link to the bot to get started!";

  return (
    <div class="empty-state">
      <p>{message}</p>
    </div>
  );
};
