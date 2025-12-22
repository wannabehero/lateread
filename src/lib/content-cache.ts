import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

export class ContentCache {
  private cacheDir: string;

  constructor(cacheDir: string = config.CACHE_DIR) {
    this.cacheDir = cacheDir;
  }

  private getFilePath(articleId: string): string {
    return join(this.cacheDir, `${articleId}.html`);
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // Directory already exists or permission error
      console.warn(`Failed to create cache directory: ${error}`);
    }
  }

  async get(articleId: string): Promise<string | null> {
    try {
      const filePath = this.getFilePath(articleId);
      const file = Bun.file(filePath);

      if (!(await file.exists())) {
        return null;
      }

      return await file.text();
    } catch (error) {
      console.error(`Failed to read cache for article ${articleId}:`, error);
      return null;
    }
  }

  async set(articleId: string, content: string): Promise<void> {
    await this.ensureCacheDir();

    try {
      const filePath = this.getFilePath(articleId);
      await Bun.write(filePath, content);
    } catch (error) {
      console.error(`Failed to write cache for article ${articleId}:`, error);
      throw error;
    }
  }

  async delete(articleId: string): Promise<void> {
    try {
      const filePath = this.getFilePath(articleId);
      await unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(
          `Failed to delete cache for article ${articleId}:`,
          error,
        );
      }
    }
  }

  async exists(articleId: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(articleId);
      const file = Bun.file(filePath);
      return await file.exists();
    } catch {
      return false;
    }
  }
}

export async function cleanupOldCache(): Promise<void> {
  const cacheDir = config.CACHE_DIR;
  const maxAgeDays = config.CACHE_MAX_AGE_DAYS;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let scannedCount = 0;
  let deletedCount = 0;

  try {
    const files = await readdir(cacheDir);

    for (const file of files) {
      if (!file.endsWith(".html")) {
        continue;
      }

      scannedCount++;
      const filePath = join(cacheDir, file);

      try {
        const stats = await stat(filePath);
        const fileAge = now - stats.mtimeMs;

        if (fileAge > maxAgeMs) {
          await unlink(filePath);
          deletedCount++;
        }
      } catch (error) {
        console.warn(`Failed to process file ${file}:`, error);
      }
    }

    console.log(
      `Cache cleanup: scanned ${scannedCount} files, deleted ${deletedCount} old files`,
    );
  } catch (error) {
    console.error("Failed to cleanup old cache:", error);
  }
}

// Export singleton instance
export const contentCache = new ContentCache();
