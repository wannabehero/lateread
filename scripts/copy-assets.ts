import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const PUBLIC_DIR = "./public";
const NODE_MODULES = "./node_modules";

const ASSETS_TO_COPY = [
  { src: "htmx.org/dist/htmx.min.js", dest: "htmx.min.js" },
  { src: "@picocss/pico/css/pico.min.css", dest: "pico.min.css" },
] as const;

async function copyAssets() {
  console.log("Copying frontend assets to public/...");

  await mkdir(PUBLIC_DIR, { recursive: true });

  try {
    for (const asset of ASSETS_TO_COPY) {
      const srcPath = join(NODE_MODULES, asset.src);
      const destPath = join(PUBLIC_DIR, asset.dest);
      await copyFile(srcPath, destPath);
      console.log(`Copied ${asset.src} to ${asset.dest}`);
    }
    console.log("All assets copied successfully");
  } catch (error) {
    console.error("Error copying assets:", error);
    process.exit(1);
  }
}

copyAssets();
