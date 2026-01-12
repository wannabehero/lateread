import type { FC } from "hono/jsx";

interface TagBadgeProps {
  name: string;
}

export const TagBadge: FC<TagBadgeProps> = ({ name }) => {
  return <span class="tag-badge">{name}</span>;
};
