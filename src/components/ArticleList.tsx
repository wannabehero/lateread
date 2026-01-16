import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { ArticleCard } from "./ArticleCard";
import { EmptyState } from "./EmptyState";
import { LoadMoreTrigger } from "./LoadMoreTrigger";
import { ProcessingBanner } from "./ProcessingBanner";

interface ArticleListProps {
  articles: (Article & { tags: Tag[] })[];
  archived?: boolean;
  processingCount?: number;
  nextCursor?: string | null;
  searchQuery?: string;
  "hx-swap-oob"?: string;
}

export const ArticleList: FC<ArticleListProps> = ({
  articles,
  archived,
  processingCount = 0,
  nextCursor,
  searchQuery,
  "hx-swap-oob": hxSwapOob,
}) => {
  const basePath = archived ? "/archive" : "/articles";

  return (
    <div id="article-container" hx-swap-oob={hxSwapOob}>
      {!archived && <ProcessingBanner count={processingCount} immediate />}
      {articles.length === 0 ? (
        <EmptyState archived={archived} />
      ) : (
        <div class="article-grid">
          {articles.map((article) => (
            <ArticleCard article={article} />
          ))}
          {nextCursor && (
            <LoadMoreTrigger
              nextCursor={nextCursor}
              basePath={basePath}
              archived={archived}
              searchQuery={searchQuery}
            />
          )}
        </div>
      )}
    </div>
  );
};
