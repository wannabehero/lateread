import type { FC } from "hono/jsx";

interface SearchFormProps {
  query?: string;
  status?: string;
}

export const SearchForm: FC<SearchFormProps> = ({ query, status }) => {
  const currentStatus = status || "all";

  return (
    <form
      hx-get="/articles"
      hx-target="#article-container"
      hx-trigger="submit, keyup changed delay:500ms from:#search-input"
      hx-swap="outerHTML"
      hx-push-url="true"
      class="search-form"
    >
      <input type="hidden" name="status" value={currentStatus} />
      <input
        type="search"
        id="search-input"
        name="q"
        placeholder="Search articles..."
        value={query || ""}
        autocomplete="off"
      />
    </form>
  );
};
