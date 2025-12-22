import type { FC } from "hono/jsx";

interface TagBadgeProps {
  name: string;
  href?: string;
}

export const TagBadge: FC<TagBadgeProps> = ({ name, href }) => {
  if (href) {
    return (
      <a
        href={href}
        class="tag-badge"
        hx-boost="true"
        hx-target="main"
        hx-swap="innerHTML"
      >
        {name}
      </a>
    );
  }

  return <span class="tag-badge">{name}</span>;
};
