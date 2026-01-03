import type { FC } from "hono/jsx";

interface HeadProps {
  title: string;

  appStyles?: string;
  appScripts?: string;
}

export const Head: FC<HeadProps> = ({
  title,
  appStyles = "app.css",
  appScripts = "app.js",
}) => (
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

    <link rel="manifest" href="/public/manifest.json" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta
      name="apple-mobile-web-app-status-bar-style"
      content="black-translucent"
    />
    <meta name="apple-mobile-web-app-title" content="lateread" />
    <meta name="format-detection" content="telephone=no" />

    <link rel="icon" href="/public/favicon.ico" sizes="any" />
    <link
      rel="icon"
      type="image/png"
      sizes="32x32"
      href="/public/icons/icon-32.png"
    />
    <link
      rel="icon"
      type="image/png"
      sizes="192x192"
      href="/public/icons/icon-192.png"
    />
    <link
      rel="apple-touch-icon"
      sizes="180x180"
      href="/public/icons/icon-180.png"
    />

    <link rel="stylesheet" href={`/public/styles/${appStyles}`} />
    <script src={`/public/scripts/${appScripts}`} type="module" defer />
  </head>
);
