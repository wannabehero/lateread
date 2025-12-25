import type { FC } from "hono/jsx";

interface EmptyStateProps {
  archived?: boolean;
  tag?: string;
}

export const EmptyState: FC<EmptyStateProps> = ({ archived, tag }) => {
  const message = tag
    ? `No articles tagged with "${tag}"`
    : archived
      ? "No archived articles yet"
      : "No articles yet. Forward a link to the bot to get started!";

  return (
    <div class="empty-state">
      <p>{message}</p>
    </div>
  );
};
