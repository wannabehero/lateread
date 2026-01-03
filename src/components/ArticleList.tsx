import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { ArticleCard } from "./ArticleCard";
import { EmptyState } from "./EmptyState";
import { ProcessingBanner } from "./ProcessingBanner";

interface ArticleListProps {
  articles: (Article & { tags: Tag[] })[];
  archived?: boolean;
  tag?: string;
  processingCount?: number;
}

export const ArticleList: FC<ArticleListProps> = ({
  articles,
  archived,
  tag,
  processingCount = 0,
}) => {
  return (
    <div id="article-container">
      {!archived && <ProcessingBanner count={processingCount} />}
      {articles.length === 0 ? (
        <EmptyState archived={archived} tag={tag} />
      ) : (
        <div class="article-grid">
          {articles.map((article) => (
            <ArticleCard article={article} />
          ))}
        </div>
      )}
    </div>
  );
};
