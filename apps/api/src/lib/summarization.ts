import { db } from "./db.js";
import { createLLMService } from "./llm/service.js";
import { fetchImageAsBase64 } from "./image-fetcher.js";
import type { UserSettings } from "@prisma/client";

const TEXT_SUMMARIZATION_SYSTEM_PROMPT = `You are a helpful assistant that creates concise summaries of web page content.
Based on the text the user has been reading on a webpage, create a brief summary that captures:
- The main topic or subject of the page
- Key points or information the user focused on
- Any important details or takeaways

Keep summaries concise (2-4 sentences) and informative.`;

const IMAGE_SUMMARIZATION_SYSTEM_PROMPT = `You are a helpful assistant that creates concise summaries of images a user viewed on a webpage.
Based on the image descriptions (alt text, titles) and viewing patterns, create a brief summary that captures:
- The types of images the user looked at
- Common themes or subjects in the images
- Any notable images that received significant attention

Keep summaries concise (2-4 sentences) and informative.`;

const INDIVIDUAL_IMAGE_SUMMARIZATION_SYSTEM_PROMPT = `You are a helpful assistant that describes images.
When shown an image, provide a brief, accurate description that captures:
- The main subject or content of the image
- Any notable details, text, or elements visible
- The type/category of image (photo, diagram, screenshot, etc.)

Keep descriptions concise (1-2 sentences) and factual.`;

/**
 * Generate a summary for text attention data from a website visit.
 */
export async function generateTextSummary(
  textContent: string,
  pageTitle: string,
  pageUrl: string,
  settings: UserSettings | null
): Promise<string> {
  const llmService = createLLMService(settings);
  const provider = llmService.getProvider();

  const prompt = `Summarize the following text content that the user read on "${pageTitle}" (${pageUrl}):

---
${textContent}
---

Provide a concise summary (2-4 sentences) of what the user was reading about.`;

  try {
    const response = await provider.generate({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: TEXT_SUMMARIZATION_SYSTEM_PROMPT,
      maxTokens: 200,
      temperature: 0.3,
    });

    await provider.flush();

    return response.content.trim();
  } catch (error) {
    console.error("Failed to generate text summary:", error);
    throw error;
  }
}

/**
 * Generate a summary for image attention data from a website visit.
 */
export async function generateImageSummary(
  images: Array<{ src: string; alt: string; title: string; hoverDuration: number }>,
  pageTitle: string,
  pageUrl: string,
  settings: UserSettings | null
): Promise<string> {
  const llmService = createLLMService(settings);
  const provider = llmService.getProvider();

  // Format image data for the prompt
  const imageDescriptions = images
    .map((img, idx) => {
      const description = img.alt || img.title || "No description";
      const duration = (img.hoverDuration / 1000).toFixed(1);
      return `${idx + 1}. "${description}" (viewed for ${duration}s)`;
    })
    .join("\n");

  const prompt = `Summarize the images the user viewed on "${pageTitle}" (${pageUrl}):

Images viewed:
${imageDescriptions}

Provide a concise summary (2-4 sentences) describing what types of images the user was looking at and any patterns in their viewing.`;

  try {
    const response = await provider.generate({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: IMAGE_SUMMARIZATION_SYSTEM_PROMPT,
      maxTokens: 200,
      temperature: 0.3,
    });

    await provider.flush();

    return response.content.trim();
  } catch (error) {
    console.error("Failed to generate image summary:", error);
    throw error;
  }
}

/**
 * Generate a description for a single image using multimodal LLM.
 * Returns null if the image cannot be fetched or processed.
 */
export async function generateIndividualImageSummary(
  imageSrc: string,
  imageAlt: string,
  imageTitle: string,
  settings: UserSettings | null
): Promise<string | null> {
  // Fetch the image
  const fetchedImage = await fetchImageAsBase64(imageSrc);
  if (!fetchedImage) {
    console.warn(`Could not fetch image for summarization: ${imageSrc}`);
    return null;
  }

  const llmService = createLLMService(settings);
  const provider = llmService.getProvider();

  // Build context from metadata if available
  const contextParts: string[] = [];
  if (imageAlt && imageAlt !== "No description") {
    contextParts.push(`Alt text: "${imageAlt}"`);
  }
  if (imageTitle) {
    contextParts.push(`Title: "${imageTitle}"`);
  }

  const contextText = contextParts.length > 0
    ? `\n\nImage metadata:\n${contextParts.join("\n")}`
    : "";

  const prompt = `Describe this image concisely.${contextText}`;

  try {
    const response = await provider.generate({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mimeType: fetchedImage.mimeType, data: fetchedImage.data },
            { type: "text", text: prompt },
          ],
        },
      ],
      systemPrompt: INDIVIDUAL_IMAGE_SUMMARIZATION_SYSTEM_PROMPT,
      maxTokens: 150,
      temperature: 0.3,
    });

    await provider.flush();

    return response.content.trim();
  } catch (error) {
    console.error("Failed to generate individual image summary:", error);
    return null;
  }
}

/**
 * Process individual image attentions that need summarization for a user.
 */
export async function processUserImageSummarization(userId: string): Promise<number> {
  // Get user settings
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  // Check if summarization is enabled
  if (!settings?.attentionSummarizationEnabled) {
    return 0;
  }

  // Find image attentions that haven't been summarized yet
  // Limit to 5 images per run to avoid overloading the system
  const imagesToSummarize = await db.imageAttention.findMany({
    where: {
      userId,
      summary: null,
    },
    orderBy: { timestamp: "desc" },
    take: 5,
  });

  let summarizedCount = 0;

  for (const image of imagesToSummarize) {
    try {
      const summary = await generateIndividualImageSummary(
        image.src,
        image.alt,
        image.title,
        settings
      );

      if (summary) {
        await db.imageAttention.update({
          where: { id: image.id },
          data: {
            summary,
            summarizedAt: new Date(),
          },
        });
        summarizedCount++;
      } else {
        // Mark as attempted even if failed to avoid retrying constantly
        await db.imageAttention.update({
          where: { id: image.id },
          data: {
            summarizedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error(`Failed to summarize image ${image.id}:`, error);
    }
  }

  return summarizedCount;
}

/**
 * Process website visits that need summarization for a specific user.
 */
export async function processUserSummarization(userId: string): Promise<number> {
  // Get user settings
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  // Check if summarization is enabled
  if (!settings?.attentionSummarizationEnabled) {
    return 0;
  }

  // Find website visits that haven't been summarized yet
  // Once summarized, a visit doesn't need re-summarization (content doesn't change)
  const visitsToSummarize = await db.websiteVisit.findMany({
    where: {
      userId,
      summarizedAt: null,
    },
    orderBy: { openedAt: "desc" },
    take: 10, // Process up to 10 visits at a time to avoid overload
  });

  // Skip if no visits need summarization
  if (visitsToSummarize.length === 0) {
    return 0;
  }

  let summarizedCount = 0;

  for (const visit of visitsToSummarize) {
    let textSummary: string | null = null;
    let imageSummary: string | null = null;
    let hasContent = false;

    // Get text attention for this visit's URL within the visit's time window
    const textAttentions = await db.textAttention.findMany({
      where: {
        userId,
        url: visit.url,
        timestamp: {
          gte: visit.openedAt,
          ...(visit.closedAt ? { lte: visit.closedAt } : {}),
        },
      },
      orderBy: { timestamp: "asc" },
    });

    // Get image attention for this visit's URL within the visit's time window
    const imageAttentions = await db.imageAttention.findMany({
      where: {
        userId,
        url: visit.url,
        timestamp: {
          gte: visit.openedAt,
          ...(visit.closedAt ? { lte: visit.closedAt } : {}),
        },
      },
      orderBy: { timestamp: "asc" },
    });

    // Generate text summary if there's enough text content
    if (textAttentions.length > 0) {
      const textContent = textAttentions.map((t) => t.text).join("\n\n");
      if (textContent.length >= 50) {
        hasContent = true;
        try {
          textSummary = await generateTextSummary(
            textContent,
            visit.title,
            visit.url,
            settings
          );
        } catch (error) {
          console.error(`Failed to generate text summary for visit ${visit.id}:`, error);
        }
      }
    }

    // Generate image summary if there are images
    if (imageAttentions.length > 0) {
      hasContent = true;
      try {
        const images = imageAttentions.map((img) => ({
          src: img.src,
          alt: img.alt,
          title: img.title,
          hoverDuration: img.hoverDuration,
        }));
        imageSummary = await generateImageSummary(
          images,
          visit.title,
          visit.url,
          settings
        );
      } catch (error) {
        console.error(`Failed to generate image summary for visit ${visit.id}:`, error);
      }
    }

    // Update the visit with summaries
    await db.websiteVisit.update({
      where: { id: visit.id },
      data: {
        summary: textSummary ?? visit.summary,
        imageSummary: imageSummary ?? visit.imageSummary,
        summarizedAt: new Date(),
      },
    });

    if (hasContent && (textSummary || imageSummary)) {
      summarizedCount++;
    }
  }

  return summarizedCount;
}

/**
 * Process summarization for all users who have it enabled.
 * Respects per-user intervals - only processes users whose interval has elapsed.
 */
export async function processAllUsersSummarization(): Promise<{
  usersProcessed: number;
  skippedIntervalNotElapsed: number;
  totalVisitsSummarized: number;
  totalImagesSummarized: number;
}> {
  const now = new Date();

  // Get all users with summarization enabled, including their interval settings
  const usersWithSummarization = await db.userSettings.findMany({
    where: {
      attentionSummarizationEnabled: true,
    },
    select: {
      userId: true,
      attentionSummarizationIntervalMs: true,
      lastSummarizationCalculatedAt: true,
    },
  });

  let usersProcessed = 0;
  let skippedIntervalNotElapsed = 0;
  let totalVisitsSummarized = 0;
  let totalImagesSummarized = 0;

  for (const userSettings of usersWithSummarization) {
    const { userId, attentionSummarizationIntervalMs, lastSummarizationCalculatedAt } = userSettings;
    const intervalMs = attentionSummarizationIntervalMs || 60000;

    // Check if user's individual interval has elapsed
    if (lastSummarizationCalculatedAt) {
      const timeSinceLastCalc = now.getTime() - lastSummarizationCalculatedAt.getTime();
      if (timeSinceLastCalc < intervalMs) {
        // User's interval hasn't elapsed yet, skip
        skippedIntervalNotElapsed++;
        continue;
      }
    }

    try {
      // Process website visit summaries
      const visitCount = await processUserSummarization(userId);
      totalVisitsSummarized += visitCount;

      // Process individual image summaries
      const imageCount = await processUserImageSummarization(userId);
      totalImagesSummarized += imageCount;

      // Update the marker
      await db.userSettings.update({
        where: { userId },
        data: { lastSummarizationCalculatedAt: now },
      });

      usersProcessed++;
    } catch (error) {
      console.error(`Failed to process summarization for user ${userId}:`, error);
    }
  }

  return {
    usersProcessed,
    skippedIntervalNotElapsed,
    totalVisitsSummarized,
    totalImagesSummarized,
  };
}
