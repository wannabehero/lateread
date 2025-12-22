import type { FC } from "hono/jsx";
import { TagBadge } from "./TagBadge";

interface Tag {
  id: string;
  name: string;
}

interface Article {
  id: string;
  title: string | null;
  description: string | null;
  url: string;
  imageUrl: string | null;
  siteName: string | null;
  createdAt: Date;
  readAt: Date | null;
  tags: Tag[];
}

interface ArticleCardProps {
  article: Article;
}

export const ArticleCard: FC<ArticleCardProps> = ({ article }) => {
  const displayTitle = article.title || article.url;
  const isRead = article.readAt !== null;

  return (
    <article class={`article-card ${isRead ? "read" : ""}`}>
      {article.imageUrl && (
        <div class="article-image">
          <img src={article.imageUrl} alt={displayTitle} loading="lazy" />
        </div>
      )}

      <div class="article-content">
        <h3>
          <a href={`/articles/${article.id}`} hx-boost="true">
            {displayTitle}
          </a>
        </h3>

        {article.description && (
          <p class="article-description">{article.description}</p>
        )}

        {article.siteName && (
          <p class="article-meta">
            <small>{article.siteName}</small>
          </p>
        )}

        {article.tags.length > 0 && (
          <div class="article-tags">
            {article.tags.map((tag) => (
              <TagBadge
                name={tag.name}
                href={`/articles?tag=${encodeURIComponent(tag.name)}`}
              />
            ))}
          </div>
        )}

        <div class="article-actions">
          <a href={`/articles/${article.id}`} class="button" hx-boost="true">
            Read
          </a>
          {!isRead && (
            <button
              type="button"
              hx-post={`/api/articles/${article.id}/read`}
              hx-swap="outerHTML"
              hx-target="closest .article-card"
            >
              Mark as Read
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
