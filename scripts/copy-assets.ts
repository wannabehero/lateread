import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const PUBLIC_DIR = "./public";
const NODE_MODULES = "./node_modules";

async function copyAssets() {
  console.log("Copying frontend assets to public/...");

  // Ensure public directory exists
  await mkdir(PUBLIC_DIR, { recursive: true });

  try {
    // Copy HTMX
    const htmxSrc = join(NODE_MODULES, "htmx.org/dist/htmx.min.js");
    const htmxDest = join(PUBLIC_DIR, "htmx.min.js");
    await copyFile(htmxSrc, htmxDest);
    console.log("Copied htmx.min.js");

    // Copy Pico CSS
    const picoSrc = join(NODE_MODULES, "@picocss/pico/css/pico.min.css");
    const picoDest = join(PUBLIC_DIR, "pico.min.css");
    await copyFile(picoSrc, picoDest);
    console.log("Copied pico.min.css");

    console.log("All assets copied successfully");
  } catch (error) {
    console.error("Error copying assets:", error);
    process.exit(1);
  }
}

copyAssets();
