import type { FC } from "hono/jsx";

interface ProcessingBannerProps {
  count: number;
}

export const ProcessingBanner: FC<ProcessingBannerProps> = ({ count }) => {
  if (count === 0) {
    return null;
  }

  return (
    <div
      class="processing-banner"
      hx-get="/api/articles/processing-count"
      hx-trigger="load, every 5s"
      hx-swap="outerHTML"
    >
      <small>
        {count} {count === 1 ? "article" : "articles"} processing...
      </small>
    </div>
  );
};
