import type { FC } from "hono/jsx";
import { ArticleCard } from "./ArticleCard";
import { EmptyState } from "./EmptyState";
import { ProcessingBanner } from "./ProcessingBanner";
import { SearchForm } from "./SearchForm";

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
  archived: boolean;
  tags: Tag[];
}

interface ArticleListProps {
  articles: Article[];
  status?: string;
  tag?: string;
  query?: string;
  processingCount?: number;
}

export const ArticleList: FC<ArticleListProps> = ({
  articles,
  status,
  tag,
  query,
  processingCount = 0,
}) => {
  const emptyMessage = query
    ? `No articles found for "${query}"`
    : tag
      ? `No articles tagged with "${tag}"`
      : status === "archived"
        ? "No archived articles yet"
        : "No articles yet. Forward a link to the bot to get started!";

  return (
    <div id="article-container">
      <ProcessingBanner count={processingCount} />
      <SearchForm query={query} status={status} />
      {articles.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div class="article-grid">
          {articles.map((article) => (
            <ArticleCard article={article} status={status} />
          ))}
        </div>
      )}
    </div>
  );
};
