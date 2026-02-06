/**
 * Utility for fetching images from URLs and converting to base64.
 */

export interface FetchedImage {
  data: string; // Base64 encoded
  mimeType: string;
}

const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit for most vision APIs
const FETCH_TIMEOUT = 10000; // 10 seconds

/**
 * Fetch an image from a URL and convert to base64.
 * Returns null if the image cannot be fetched or is not a supported type.
 */
export async function fetchImageAsBase64(
  imageUrl: string
): Promise<FetchedImage | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Kaizen/1.0; +https://kaizen.app)",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(
        `Failed to fetch image from ${imageUrl}: ${response.status}`
      );
      return null;
    }

    // Check content type
    const contentType = response.headers.get("content-type") || "";
    const mimeType = contentType.split(";")[0].trim().toLowerCase();

    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      console.warn(
        `Unsupported image type for ${imageUrl}: ${mimeType}`
      );
      return null;
    }

    // Check content length if available
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_IMAGE_SIZE) {
      console.warn(
        `Image too large at ${imageUrl}: ${contentLength} bytes`
      );
      return null;
    }

    // Get the image data as array buffer
    const arrayBuffer = await response.arrayBuffer();

    // Check actual size
    if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
      console.warn(
        `Image too large at ${imageUrl}: ${arrayBuffer.byteLength} bytes`
      );
      return null;
    }

    // Convert to base64
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return {
      data: base64,
      mimeType,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`Timeout fetching image from ${imageUrl}`);
    } else {
      console.warn(`Error fetching image from ${imageUrl}:`, error);
    }
    return null;
  }
}

/**
 * Infer MIME type from URL extension if content-type is not available.
 */
export function inferMimeTypeFromUrl(url: string): string | null {
  const extension = url.split(".").pop()?.toLowerCase().split("?")[0];

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}
