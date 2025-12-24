import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { TagBadge } from "./TagBadge";

interface ArticleCardProps {
  article: Article & { tags: Tag[] };
  status?: string;
}

export const ArticleCard: FC<ArticleCardProps> = ({ article, status }) => {
  const displayTitle = article.title || article.url;
  const isRead = article.readAt !== null;
  const isArchived = article.archived;

  // Build tag URL preserving current view context
  const buildTagUrl = (tagName: string) => {
    const params = new URLSearchParams();
    if (status === "archived") {
      params.set("status", "archived");
    }
    params.set("tag", tagName);
    return `/articles?${params.toString()}`;
  };

  return (
    <article class={`article-card ${isRead ? "read" : ""}`}>
      {article.imageUrl && (
        <div class="article-image">
          <img src={article.imageUrl} alt={displayTitle} loading="lazy" />
        </div>
      )}

      <div class="article-content">
        <h3>
          <a href={`/articles/${article.id}`}>{displayTitle}</a>
        </h3>

        {article.description && (
          <p class="article-description">{article.description}</p>
        )}

        {article.siteName && (
          <p class="article-meta">
            <small>{article.siteName}</small>
          </p>
        )}

        <div class="article-actions">
          <button
            type="button"
            hx-post={`/api/articles/${article.id}/archive`}
            hx-swap="outerHTML"
            hx-target="closest .article-card"
            hx-disabled-elt="this"
            class="archive-button"
            title={isArchived ? "Unarchive" : "Archive"}
          >
            <span class="button-text">
              <img
                src={`/public/icons/${isArchived ? "archive-restore" : "archive"}.svg`}
                alt={isArchived ? "Unarchive" : "Archive"}
                class="button-icon"
              />
            </span>
            <span class="button-loading">
              <span class="spinner"></span>
            </span>
          </button>
        </div>
      </div>
    </article>
  );
};
