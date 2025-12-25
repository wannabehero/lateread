import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { ArticleCard } from "./ArticleCard";

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
                <ArticleCard article={article} />
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
