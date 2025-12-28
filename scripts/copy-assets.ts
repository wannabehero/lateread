import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const PUBLIC_DIR = "./public";
const NODE_MODULES = "./node_modules";

const ASSETS_TO_COPY = [
  {
    src: join(NODE_MODULES, "htmx.org/dist/htmx.min.js"),
    dest: join(PUBLIC_DIR, "htmx.min.js"),
    name: "htmx.min.js",
  },
  {
    src: join(NODE_MODULES, "@picocss/pico/css/pico.min.css"),
    dest: join(PUBLIC_DIR, "pico.min.css"),
    name: "pico.min.css",
  },
] as const;

async function copyAssets() {
  console.log("Copying frontend assets to public/...");

  await mkdir(PUBLIC_DIR, { recursive: true });

  try {
    for (const asset of ASSETS_TO_COPY) {
      await copyFile(asset.src, asset.dest);
      console.log(`Copied ${asset.name}`);
    }
    console.log("All assets copied successfully");
  } catch (error) {
    console.error("Error copying assets:", error);
    process.exit(1);
  }
}

copyAssets();
