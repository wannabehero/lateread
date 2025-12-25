import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface ExtractedContent {
  title: string;
  content?: string | null;
  textContent?: string | null;
  excerpt?: string | null;
  byline?: string;
  siteName?: string;
  description?: string;
  imageUrl?: string;
}

export async function extractCleanContent(
  url: string,
): Promise<ExtractedContent> {
  try {
    // Fetch URL with timeout and custom user agent
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; lateread/1.0; +https://github.com/wannabehero)",
      },
      signal: controller.signal,
      redirect: "follow", // Follow up to 5 redirects (default)
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // Parse HTML with JSDOM
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    // Extract OpenGraph metadata with fallbacks
    const getMetaContent = (
      property: string,
      fallbackName?: string,
    ): string | undefined => {
      // Try OpenGraph property
      let meta = document.querySelector(`meta[property="${property}"]`);
      if (meta) {
        return meta.getAttribute("content") || undefined;
      }

      // Try Twitter card property
      if (property.startsWith("og:")) {
        const twitterProperty = property.replace("og:", "twitter:");
        meta = document.querySelector(`meta[name="${twitterProperty}"]`);
        if (meta) {
          return meta.getAttribute("content") || undefined;
        }
      }

      // Try regular meta tag with name
      if (fallbackName) {
        meta = document.querySelector(`meta[name="${fallbackName}"]`);
        if (meta) {
          return meta.getAttribute("content") || undefined;
        }
      }

      return undefined;
    };

    const ogTitle = getMetaContent("og:title");
    const ogDescription = getMetaContent("og:description", "description");
    const ogImage = getMetaContent("og:image", "image");
    const ogSiteName = getMetaContent("og:site_name");

    // Run Readability to extract article content
    const reader = new Readability(document);
    const article = reader.parse();

    if (!article) {
      throw new Error("Readability failed to extract article content");
    }

    // Return structured result
    return {
      title: ogTitle || article.title || "Untitled",
      content: article.content,
      textContent: article.textContent,
      excerpt: article.excerpt,
      byline: article.byline || undefined,
      siteName: ogSiteName || article.siteName || undefined,
      description: ogDescription || article.excerpt || undefined,
      imageUrl: ogImage || undefined,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(
          "Request timeout: Failed to fetch URL within 30 seconds",
        );
      }
      throw new Error(`Failed to extract content: ${error.message}`);
    }
    throw error;
  }
}
