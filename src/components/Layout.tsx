import type { FC } from "hono/jsx";

interface LayoutProps {
  title?: string;
  // biome-ignore lint/suspicious/noExplicitAny: can be any content
  children: any;
  isAuthenticated?: boolean;
  currentPath?: string;
}

export const Layout: FC<LayoutProps> = ({
  title = "lateread",
  children,
  isAuthenticated = false,
  currentPath = "/",
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
          content="lateread - Privacy-focused read-later app"
        />

        {/* PWA Manifest */}
        <link rel="manifest" href="/public/manifest.json" />
        <meta name="theme-color" content="#1095c1" />
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
        <link rel="stylesheet" href="/public/styles.css" />

        {/* HTMX */}
        <script src="/public/htmx.min.js" defer></script>
      </head>
      <body>
        <header class="container">
          <nav>
            <ul>
              <li>
                <strong>
                  <a href="/" hx-boost="true">
                    lateread
                  </a>
                </strong>
              </li>
            </ul>
            {isAuthenticated && (
              <ul>
                <li>
                  <a
                    href="/articles"
                    class={currentPath.startsWith("/articles") ? "active" : ""}
                  >
                    Articles
                  </a>
                </li>
                <li>
                  <a
                    href="/articles?status=archived"
                    class={
                      currentPath.includes("status=archived") ? "active" : ""
                    }
                  >
                    Archive
                  </a>
                </li>
                <li>
                  <form action="/auth/logout" method="post">
                    <button type="submit" class="outline secondary">
                      Logout
                    </button>
                  </form>
                </li>
              </ul>
            )}
          </nav>
        </header>

        <main class="container">{children}</main>

        <footer class="container">
          <small>
            lateread |{" "}
            <a
              href="https://github.com/wannabehero/lateread"
              target="_blank"
              rel="noopener"
            >
              GitHub
            </a>
          </small>
        </footer>
      </body>
    </html>
  );
};
