import type { FC } from "hono/jsx";

interface LoadMoreTriggerProps {
  nextCursor: string;
  basePath?: string;
  archived?: boolean;
  searchQuery?: string;
}

export const LoadMoreTrigger: FC<LoadMoreTriggerProps> = ({
  nextCursor,
  basePath = "/articles",
  archived,
  searchQuery,
}) => {
  const buildUrl = () => {
    const params = new URLSearchParams();
    params.set("cursor", nextCursor);
    if (archived !== undefined) {
      params.set("archived", archived.toString());
    }
    if (searchQuery) {
      params.set("q", searchQuery);
    }
    return `${basePath}?${params.toString()}`;
  };

  return (
    <div
      class="load-more-trigger"
      hx-get={buildUrl()}
      hx-trigger="intersect once threshold:0.1"
      hx-swap="outerHTML"
    >
      <div class="loading-spinner">
        <output class="spinner" aria-label="Loading more articles" />
      </div>
    </div>
  );
};
