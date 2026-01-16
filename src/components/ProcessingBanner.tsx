import type { FC } from "hono/jsx";

interface ProcessingBannerProps {
  count: number;
  immediate?: boolean;
}

export const ProcessingBanner: FC<ProcessingBannerProps> = ({
  count,
  immediate,
}) => {
  if (count === 0) {
    return null;
  }

  return (
    <div
      class="processing-banner"
      hx-get={`/api/articles/processing-count?previous=${count}`}
      hx-trigger={immediate ? "load, every 5s" : "load delay:5s"}
      hx-swap="outerHTML"
    >
      <small>
        {count} {count === 1 ? "article" : "articles"} processing...
      </small>
    </div>
  );
};
