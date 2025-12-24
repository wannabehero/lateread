import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { ArticleCard } from "./ArticleCard";
import { EmptyState } from "./EmptyState";
import { ProcessingBanner } from "./ProcessingBanner";

interface ArticleListProps {
  articles: (Article & { tags: Tag[] })[];
  status?: string;
  tag?: string;
  processingCount?: number;
}

export const ArticleList: FC<ArticleListProps> = ({
  articles,
  status,
  tag,
  processingCount = 0,
}) => {
  const emptyMessage = tag
    ? `No articles tagged with "${tag}"`
    : status === "archived"
      ? "No archived articles yet"
      : "No articles yet. Forward a link to the bot to get started!";

  return (
    <div id="article-container">
      <ProcessingBanner count={processingCount} />
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
