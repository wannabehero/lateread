import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { formatReadingTime, formatRelativeTime } from "../lib/date";

interface ArticleCardProps {
  article: Article & { tags: Tag[] };
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
          <a href={`/articles/${article.id}`}>{displayTitle}</a>
        </h3>

        {article.description && (
          <p class="article-description">{article.description}</p>
        )}

        <p class="article-meta">
          <small>
            {article.siteName && <span>{article.siteName}</span>}
            {article.siteName &&
              (article.createdAt || article.readingTimeSeconds) && (
                <span> • </span>
              )}
            {article.createdAt && (
              <span class="article-date">
                {formatRelativeTime(article.createdAt)}
              </span>
            )}
            {article.createdAt && article.readingTimeSeconds && (
              <span> • </span>
            )}
            {article.readingTimeSeconds && (
              <span class="reading-time">
                {formatReadingTime(article.readingTimeSeconds)}
              </span>
            )}
            {article.rating === 1 && <span class="rating"> • 👍</span>}
            {article.rating === -1 && <span class="rating"> • 👎</span>}
          </small>
        </p>
      </div>
    </article>
  );
};
