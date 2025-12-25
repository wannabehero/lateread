import type { FC } from "hono/jsx";

interface LayoutProps {
  title?: string;
  // biome-ignore lint/suspicious/noExplicitAny: can be any content
  children: any;
  isAuthenticated?: boolean;
  currentPath?: string;
  overrideControls?: any;
}

export const Layout: FC<LayoutProps> = ({
  title = "lateread",
  children,
  isAuthenticated = false,
  currentPath = "/",
  overrideControls,
}) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <title>{title}</title>
        <meta
          name="description"
          content="lateread - privacy-focused read-later app"
        />

        {/* PWA Manifest */}
        <link rel="manifest" href="/public/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="lateread" />
        <meta name="format-detection" content="telephone=no" />

        {/* Favicons */}
        <link rel="icon" href="/public/favicon.ico" sizes="any" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/public/icon-32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/public/icon-192.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/public/icon-180.png"
        />

        {/* Pico CSS */}
        <link rel="stylesheet" href="/public/pico.min.css" />

        {/* Custom styles */}
        <link rel="stylesheet" href="/public/styles/app.css" />

        {/* HTMX */}
        <script src="/public/htmx.min.js" defer></script>
        <script src="/public/scripts/app.js" type="module" defer></script>
      </head>
      <body>
        <header class="fixed-nav">
          <div class="nav-content">
            <div class="nav-brand">
              <a href="/" hx-boost="true">
                <img
                  src="/public/icon-192.png"
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
                      src="/public/icons/search.svg"
                      alt="Search"
                      class="nav-icon"
                    />
                  </a>
                  <a
                    href="/articles?status=archived"
                    class="nav-icon-link"
                    title="Archive"
                  >
                    <img
                      src="/public/icons/archive.svg"
                      alt="Archive"
                      class="nav-icon"
                    />
                  </a>
                  <div class="nav-menu">
                    <button type="button" class="nav-icon-button">
                      <img
                        src="/public/icons/menu.svg"
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

        <main class="container main-content">{children}</main>
      </body>
    </html>
  );
};
