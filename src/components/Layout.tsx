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
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <meta
          name="description"
          content="lateread - Privacy-focused read-later app"
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
                    href="/articles?status=unread"
                    class={currentPath.startsWith("/articles") ? "active" : ""}
                  >
                    Unread
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
