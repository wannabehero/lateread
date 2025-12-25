import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { config } from "../lib/config";
import { formatRelativeTime } from "../lib/date";
import { TagBadge } from "./TagBadge";

interface ReaderViewProps {
  article: Article & { tags: Tag[] };
  content: string;
}

export const ReaderView: FC<ReaderViewProps> = ({ article, content }) => {
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

      {!config.HIDE_AUDIO_PLAYER && (
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
        {!article.archived && (
          <div class="reader-actions">
            <button
              type="button"
              hx-post={`/api/articles/${article.id}/archive`}
              hx-swap="delete"
              hx-target="closest .reader-actions"
              hx-disabled-elt="this"
              title="Archive"
            >
              <span class="button-text">
                <img
                  src="/public/icons/archive.svg"
                  alt="Archive"
                  class="button-icon"
                />
              </span>
              <span class="button-loading">
                <span class="spinner"></span>
              </span>
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};
