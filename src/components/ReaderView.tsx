import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { formatReadingTime, formatRelativeTime } from "../lib/date";
import { TagBadge } from "./TagBadge";

interface ReaderViewProps {
  article: Article & { tags: Tag[] };
  content: string;

  features: {
    tts: boolean;
    summary: boolean;
  };
}

export const ReaderView: FC<ReaderViewProps> = ({
  article,
  content,
  features,
}) => {
  const displayTitle = article.title || article.url;

  return (
    <div class="reader-view">
      <header class="reader-header">
        <h1>{displayTitle}</h1>

        <div class="reader-meta">
          {article.siteName && (
            <span class="site-name">{article.siteName}</span>
          )}
          {article.createdAt && (
            <span class="article-date">
              Added {formatRelativeTime(article.createdAt)}
            </span>
          )}
          {article.readingTimeSeconds && (
            <span class="reading-time">
              {formatReadingTime(article.readingTimeSeconds)}
            </span>
          )}
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            View Original
          </a>
        </div>

        {article.tags.length > 0 && (
          <div class="reader-tags">
            {article.tags.map((tag) => (
              <TagBadge
                name={tag.name}
                href={`/articles?tag=${encodeURIComponent(tag.name)}`}
              />
            ))}
          </div>
        )}
      </header>

      {features.summary && (
        <section class="reader-summary">
          <details>
            <summary
              hx-post={`/api/articles/${article.id}/summarize`}
              hx-target="#summaries"
              hx-swap="innerHTML"
              hx-trigger="click once"
            >
              Summary
            </summary>
            <div id="summaries" class="summary-content">
              <div class="summary-placeholder">
                <span class="spinner"></span>
                Generating...
              </div>
            </div>
          </details>
        </section>
      )}

      {features.tts && (
        <section class="reader-audio">
          <audio
            id="article-audio"
            controls
            preload="none"
            src={`/api/articles/${article.id}/tts`}
            data-title={displayTitle}
            hx-on-play="setAudioMetadata(this)"
          />
        </section>
      )}

      <div
        class="reader-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />

      <footer
        class="reader-footer"
        {...(!article.readAt && {
          "hx-post": `/api/articles/${article.id}/read`,
          "hx-trigger": "intersect once",
          "hx-swap": "none",
        })}
      >
        <div class="reader-actions">
          <share-copy-button data-url={article.url} data-title={displayTitle} />
          {!article.archived && (
            <>
              <button
                type="button"
                hx-post={`/api/articles/${article.id}/rate?rating=-1`}
                hx-swap="none"
                hx-disabled-elt="this"
                title="Dislike"
              >
                <span class="button-text">
                  <img
                    src="/public/assets/thumbs-down.svg"
                    alt="Dislike"
                    class="button-icon"
                  />
                </span>
                <span class="button-loading">
                  <span class="spinner"></span>
                </span>
              </button>
              <button
                type="button"
                hx-post={`/api/articles/${article.id}/rate?rating=1`}
                hx-swap="none"
                hx-disabled-elt="this"
                title="Like"
              >
                <span class="button-text">
                  <img
                    src="/public/assets/thumbs-up.svg"
                    alt="Like"
                    class="button-icon"
                  />
                </span>
                <span class="button-loading">
                  <span class="spinner"></span>
                </span>
              </button>
            </>
          )}
          {article.archived && article.rating !== 0 && (
            <span
              class="rating-indicator"
              title={article.rating === 1 ? "Liked" : "Disliked"}
            >
              <img
                src={`/public/assets/thumbs-${article.rating === 1 ? "up" : "down"}.svg`}
                alt={article.rating === 1 ? "Liked" : "Disliked"}
                class="button-icon"
              />
            </span>
          )}
          <span class="spacer" />
          <button
            type="button"
            hx-delete={`/api/articles/${article.id}`}
            hx-swap="none"
            hx-disabled-elt="this"
            hx-confirm="Are you sure you want to delete this article? This action cannot be undone."
            class="delete-button"
            title="Delete"
          >
            <span class="button-text">
              <img
                src="/public/assets/trash-2.svg"
                alt="Delete"
                class="button-icon"
              />
            </span>
            <span class="button-loading">
              <span class="spinner"></span>
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
};
