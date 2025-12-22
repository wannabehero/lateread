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

interface ReaderViewProps {
  article: Article;
  content: string;
}

export const ReaderView: FC<ReaderViewProps> = ({ article, content }) => {
  const displayTitle = article.title || article.url;

  return (
    <div class="reader-view">
      <header class="reader-header">
        <h1>{displayTitle}</h1>

        <div class="reader-meta">
          {article.siteName && <span class="site-name">{article.siteName}</span>}
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
        <button
          type="button"
          hx-post={`/api/articles/${article.id}/summarize`}
          hx-target="#summaries"
          hx-swap="innerHTML"
        >
          Summarize Article
        </button>
        <div id="summaries"></div>
      </section>

      <article class="reader-content" dangerouslySetInnerHTML={{ __html: content }} />

      <footer class="reader-footer">
        <div class="reader-actions">
          <button
            type="button"
            hx-post={`/api/articles/${article.id}/archive`}
            hx-swap="none"
          >
            Archive
          </button>
        </div>
      </footer>

      {/* Auto-mark as read when user scrolls to bottom */}
      {!article.readAt && (
        <div
          hx-post={`/api/articles/${article.id}/read`}
          hx-trigger="intersect once"
          hx-swap="none"
          style="height: 1px;"
        />
      )}
    </div>
  );
};
