import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { formatRelativeTime } from "../lib/date";

interface ArticleCardProps {
  article: Article & { tags: Tag[] };
  displayActions?: boolean;
}

export const ArticleCard: FC<ArticleCardProps> = ({
  article,
  displayActions = true,
}) => {
  const displayTitle = article.title || article.url;
  const isRead = article.readAt !== null;
  const isArchived = article.archived;

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

        <p class="article-meta">
          <small>
            {article.siteName && <span>{article.siteName}</span>}
            {article.siteName && article.createdAt && <span> • </span>}
            {article.createdAt && (
              <span class="article-date">
                {formatRelativeTime(article.createdAt)}
              </span>
            )}
          </small>
        </p>

        {displayActions && (
          <div class="article-actions">
            <button
              type="button"
              onclick="shareArticle(this)"
              data-url={article.url}
              data-title={article.title || ""}
              class="share-button"
              title="Share"
            >
              <img
                src="/public/assets/share.svg"
                alt="Share"
                class="button-icon"
              />
            </button>
            <button
              type="button"
              hx-post={`/api/articles/${article.id}/archive`}
              hx-swap="delete"
              hx-target="closest .article-card"
              hx-disabled-elt="this"
              class="archive-button"
              title={isArchived ? "Unarchive" : "Archive"}
            >
              <span class="button-text">
                <img
                  src={`/public/assets/${isArchived ? "archive-restore" : "archive"}.svg`}
                  alt={isArchived ? "Unarchive" : "Archive"}
                  class="button-icon"
                />
              </span>
              <span class="button-loading">
                <span class="spinner"></span>
              </span>
            </button>
          </div>
        )}
      </div>
    </article>
  );
};
