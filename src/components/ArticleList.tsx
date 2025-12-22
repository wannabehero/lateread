import type { FC } from "hono/jsx";
import { ArticleCard } from "./ArticleCard";

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

interface ArticleListProps {
  articles: Article[];
  status?: string;
  tag?: string;
}

export const ArticleList: FC<ArticleListProps> = ({ articles, status, tag }) => {
  if (articles.length === 0) {
    return (
      <div class="empty-state">
        <p>
          {tag
            ? `No articles tagged with "${tag}"`
            : status === "archived"
            ? "No archived articles yet"
            : "No articles yet. Forward a link to the bot to get started!"}
        </p>
      </div>
    );
  }

  return (
    <div class="article-grid">
      {articles.map((article) => (
        <ArticleCard article={article} />
      ))}
    </div>
  );
};
