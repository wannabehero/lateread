import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";

type ArticleWithTags = Article & {
  tags: Tag[];
};

interface SearchPageProps {
  query?: string;
  articles: ArticleWithTags[];
}

export const SearchPage: FC<SearchPageProps> = ({ query, articles }) => {
  return (
    <div>
      <h1>Search</h1>

      <form
        hx-get="/search"
        hx-target="#search-results"
        hx-trigger="submit, keyup changed delay:500ms from:#search-input"
        hx-swap="outerHTML"
        hx-push-url="true"
        class="search-form"
      >
        <input
          type="search"
          id="search-input"
          name="q"
          placeholder="Search all articles..."
          value={query || ""}
          autocomplete="off"
          autofocus
        />
      </form>

      <div id="search-results">
        {query ? (
          articles.length > 0 ? (
            <div class="article-grid">
              {articles.map((article) => (
                <article class={`article-card ${article.readAt ? "read" : ""}`}>
                  {article.imageUrl && (
                    <div class="article-image">
                      <img
                        src={article.imageUrl}
                        alt={article.title || "Article"}
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div class="article-content">
                    <h3>
                      <a href={`/articles/${article.id}`}>{article.title}</a>
                    </h3>
                    {article.description && (
                      <p class="article-description">{article.description}</p>
                    )}
                    <div class="article-meta">
                      {article.siteName && <span>{article.siteName}</span>}
                      {article.siteName && article.createdAt && (
                        <span> • </span>
                      )}
                      {article.createdAt && (
                        <time>
                          {new Date(article.createdAt).toLocaleDateString()}
                        </time>
                      )}
                      {article.archived && (
                        <>
                          <span> • </span>
                          <span>Archived</span>
                        </>
                      )}
                    </div>
                    {article.tags && article.tags.length > 0 && (
                      <div class="article-tags">
                        {article.tags.map((tag) => (
                          <a
                            href={`/articles?tag=${tag.name}`}
                            class="tag-badge"
                          >
                            {tag.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div class="empty-state">
              <p>No articles found for "{query}"</p>
            </div>
          )
        ) : (
          <div class="empty-state">
            <p>Enter a search query to find articles</p>
          </div>
        )}
      </div>
    </div>
  );
};
