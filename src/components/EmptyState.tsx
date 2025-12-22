import type { FC } from "hono/jsx";

interface EmptyStateProps {
  message: string;
}

export const EmptyState: FC<EmptyStateProps> = ({ message }) => {
  return (
    <div class="empty-state">
      <p>{message}</p>
    </div>
  );
};
