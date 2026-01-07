import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { Head } from "../../components/Head";
import { NavHeader } from "../../components/NavHeader";
import type { AppContext } from "../../types/context";

// I don't think I'm in love with this
// It looks to me that the bundler is great for SPAs but not SSR apps
function getAssetNames(): { appJs: string; appCss: string } {
  // In test environment, assets aren't built - use fallback values
  // The Head component has defaults of app.js/app.css anyway
  if (process.env.NODE_ENV === "test") {
    return { appJs: "app.js", appCss: "app.css" };
  }

  let appJs: string | undefined;
  let appCss: string | undefined;

  const jsFiles = new Bun.Glob("app*.js").scanSync("public/scripts");
  for (const file of jsFiles) {
    appJs = file;
    break;
  }

  // Find app*.css files in public/styles
  const cssFiles = new Bun.Glob("app*.css").scanSync("public/styles");
  for (const file of cssFiles) {
    appCss = file;
    break;
  }

  if (!appJs || !appCss) {
    throw new Error("Failed to find app.js or app.css, check the build");
  }

  return { appCss, appJs };
}

// In prod it will have the app-{hash}.[js|css] files
// In dev just plain app.[js|css]
// In test, fallback values are used
const { appCss, appJs } = getAssetNames();

export function renderWithLayout({
  c,
  content,
  overrideControls,
  collapsibleHeader = false,
  statusCode = 200,
}: {
  c: Context<AppContext>;
  // biome-ignore lint/suspicious/noExplicitAny: can be any JSX content
  content: any;
  // biome-ignore lint/suspicious/noExplicitAny: can be any JSX content
  overrideControls?: any;
  collapsibleHeader?: boolean;
  statusCode?: ContentfulStatusCode;
}): Response | Promise<Response> {
  return c.html(
    <html lang="en">
      <Head title="lateread" appScripts={appJs} appStyles={appCss} />
      <body hx-boost="true">
        <NavHeader
          isAuthenticated={!!c.var.userId}
          overrideControls={overrideControls}
          isCollapsible={collapsibleHeader}
        />

        <main class="container main-content">{content}</main>
      </body>
    </html>,
    statusCode,
  );
}
