import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { ArticleCard } from "./ArticleCard";
import { LoadMoreTrigger } from "./LoadMoreTrigger";

type ArticleWithTags = Article & {
  tags: Tag[];
};

interface SearchPageProps {
  query?: string;
  articles: ArticleWithTags[];
  nextCursor?: string | null;
}

export const SearchResults: FC<SearchPageProps> = ({
  query,
  articles,
  nextCursor,
}) => {
  return (
    <div id="search-results">
      {query ? (
        articles.length > 0 ? (
          <div class="article-grid">
            {articles.map((article) => (
              <ArticleCard article={article} />
            ))}
            {nextCursor && (
              <LoadMoreTrigger
                nextCursor={nextCursor}
                basePath="/search"
                searchQuery={query}
              />
            )}
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
  );
};

export const SearchPage: FC<SearchPageProps> = ({
  query,
  articles,
  nextCursor,
}) => {
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
      <SearchResults
        query={query}
        articles={articles}
        nextCursor={nextCursor}
      />
    </div>
  );
};
