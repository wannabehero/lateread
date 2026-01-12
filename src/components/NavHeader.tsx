import type { FC } from "hono/jsx";

interface NavHeaderProps {
  isAuthenticated?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: any jsx content
  overrideControls?: any;
  isCollapsible?: boolean;
}

export const NavHeader: FC<NavHeaderProps> = ({
  isAuthenticated,
  overrideControls,
  isCollapsible,
}) => (
  <header
    class="fixed-nav"
    {...(isCollapsible && { "data-collapsible": "true" })}
  >
    <div class="nav-content">
      <div class="nav-brand">
        <a href="/">
          <img
            src="/public/icons/icon-192.png"
            alt="lateread logo"
            class="nav-logo"
          />
          <strong>lateread</strong>
        </a>
      </div>
      {isAuthenticated &&
        (overrideControls || (
          <div class="nav-actions">
            <a href="/search" class="nav-icon-link" title="Search">
              <img
                src="/public/assets/search.svg"
                alt="Search"
                class="nav-icon"
              />
            </a>
            <a href="/archive" class="nav-icon-link" title="Archive">
              <img
                src="/public/assets/archive.svg"
                alt="Archive"
                class="nav-icon"
              />
            </a>
            <div class="nav-menu">
              <button type="button" class="nav-icon-button">
                <img
                  src="/public/assets/menu.svg"
                  alt="Menu"
                  class="nav-icon"
                />
              </button>
              <div class="nav-dropdown">
                <form action="/auth/logout" method="post">
                  <button type="submit" class="dropdown-item">
                    Log out
                  </button>
                </form>
              </div>
            </div>
          </div>
        ))}
    </div>
  </header>
);
