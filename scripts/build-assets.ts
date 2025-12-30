import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PUBLIC_DIR = "./public";
const SCRIPTS_DIR = join(PUBLIC_DIR, "scripts");
const STYLES_DIR = join(PUBLIC_DIR, "styles");

async function buildJavaScript() {
  console.log("Building JavaScript...");

  // Bundle and minify the main app.js entry point
  const result = await Bun.build({
    entrypoints: [join(SCRIPTS_DIR, "app.js")],
    outdir: SCRIPTS_DIR,
    naming: "[dir]/[name].min.[ext]",
    minify: true,
    sourcemap: "none",
  });

  if (!result.success) {
    console.error("JavaScript build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log("JavaScript built successfully");
}

async function buildCSS() {
  console.log("Building CSS...");

  // Read app.css to get the import order
  const appCss = await readFile(join(STYLES_DIR, "app.css"), "utf-8");

  // Extract all @import statements
  const importMatches = appCss.matchAll(/@import url\(["']\.\/(.+?)["']\);/g);
  const imports = Array.from(importMatches).map((match) => match[1]);

  // Bundle all CSS files (no minification needed)
  let bundledCss = "";
  for (const file of imports) {
    const content = await readFile(join(STYLES_DIR, file), "utf-8");
    bundledCss += content + "\n";
  }

  // Write the bundled CSS
  await writeFile(join(STYLES_DIR, "app.min.css"), bundledCss);
  console.log(`Bundled CSS: ${imports.join(", ")} -> app.min.css`);

  console.log("CSS built successfully");
}

async function build() {
  try {
    await buildJavaScript();
    await buildCSS();
    console.log("All assets built successfully");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();
