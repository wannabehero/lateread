import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

export class ContentCache {
  private cacheDir: string;

  constructor(cacheDir: string = config.CACHE_DIR) {
    this.cacheDir = cacheDir;
  }

  private getFilePath(userId: string, articleId: string): string {
    return join(this.cacheDir, userId, `${articleId}.html`);
  }

  private async ensureCacheDir(userId: string): Promise<void> {
    try {
      const userCacheDir = join(this.cacheDir, userId);
      await mkdir(userCacheDir, { recursive: true });
    } catch (error) {
      // Directory already exists or permission error
      console.warn(`Failed to create cache directory: ${error}`);
    }
  }

  async get(userId: string, articleId: string): Promise<string | null> {
    try {
      const filePath = this.getFilePath(userId, articleId);
      const file = Bun.file(filePath);

      if (!(await file.exists())) {
        return null;
      }

      return file.text();
    } catch (error) {
      console.error(`Failed to read cache for article ${articleId}:`, error);
      return null;
    }
  }

  async set(userId: string, articleId: string, content: string): Promise<void> {
    await this.ensureCacheDir(userId);

    try {
      const filePath = this.getFilePath(userId, articleId);
      await Bun.write(filePath, content);
    } catch (error) {
      console.error(`Failed to write cache for article ${articleId}:`, error);
      throw error;
    }
  }

  async delete(userId: string, articleId: string): Promise<void> {
    try {
      const filePath = this.getFilePath(userId, articleId);
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

  async exists(userId: string, articleId: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(userId, articleId);
      const file = Bun.file(filePath);
      return file.exists();
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
    // Scan user subdirectories
    const userDirs = await readdir(cacheDir);

    for (const userDir of userDirs) {
      const userDirPath = join(cacheDir, userDir);

      // Skip if not a directory
      try {
        const dirStat = await stat(userDirPath);
        if (!dirStat.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      // Scan files in user directory
      const files = await readdir(userDirPath);

      for (const file of files) {
        if (!file.endsWith(".html")) {
          continue;
        }

        scannedCount++;
        const filePath = join(userDirPath, file);

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
