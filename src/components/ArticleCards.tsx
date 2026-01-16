import type { FC } from "hono/jsx";
import type { Article, Tag } from "../db/types";
import { ArticleCard } from "./ArticleCard";
import { LoadMoreTrigger } from "./LoadMoreTrigger";

interface ArticleCardsProps {
  articles: (Article & { tags: Tag[] })[];
  nextCursor: string | null;
  basePath?: string;
  archived?: boolean;
  searchQuery?: string;
}

export const ArticleCards: FC<ArticleCardsProps> = ({
  articles,
  nextCursor,
  basePath = "/articles",
  archived,
  searchQuery,
}) => {
  return (
    <>
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
    </>
  );
};
