import { Hono } from "hono";
import { db, events } from "../lib/index.js";
import { deviceAuthMiddleware, type DeviceAuthVariables } from "../middleware/index.js";
import { generateIndividualImageSummary } from "../lib/summarization.js";

const app = new Hono<{ Variables: DeviceAuthVariables }>();

// Text Attention - internal tracking only
app.post("/text", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    url: string;
    text: string;
    wordsRead: number;
    timestamp: number;
  }>();

  const attention = await db.textAttention.create({
    data: {
      url: body.url,
      text: body.text,
      wordsRead: body.wordsRead,
      timestamp: new Date(body.timestamp),
      userId,
    },
  });

  return c.json(attention);
});

// Image Attention - tracks image attention and returns AI-generated summary
app.post("/image", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    url: string;
    src: string;
    alt: string;
    title: string;
    width: number;
    height: number;
    hoverDuration: number;
    confidence: number;
    timestamp: number;
    kaizenId?: string;
  }>();

  // Get user settings for LLM configuration
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  // Generate image summary using multimodal LLM
  let summary: string | null = null;
  if (settings?.attentionSummarizationEnabled) {
    try {
      summary = await generateIndividualImageSummary(
        body.src,
        body.alt,
        body.title,
        settings
      );
      console.log(`[Image Attention] Generated summary for kaizen-id: ${body.kaizenId}`);
    } catch (error) {
      console.error("Failed to generate image summary:", error);
    }
  }

  const attention = await db.imageAttention.create({
    data: {
      url: body.url,
      src: body.src,
      alt: body.alt,
      title: body.title,
      width: body.width,
      height: body.height,
      hoverDuration: body.hoverDuration,
      confidence: body.confidence,
      timestamp: new Date(body.timestamp),
      userId,
      summary,
      summarizedAt: summary ? new Date() : null,
    },
  });

  return c.json({ ...attention, summary, kaizenId: body.kaizenId });
});

// Audio Attention - internal tracking only
app.post("/audio", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    url: string;
    src: string;
    title: string;
    duration: number;
    playbackDuration: number;
    currentTime: number;
    confidence: number;
    timestamp: number;
  }>();

  const attention = await db.audioAttention.create({
    data: {
      url: body.url,
      src: body.src,
      title: body.title,
      duration: body.duration,
      playbackDuration: body.playbackDuration,
      currentTime: body.currentTime,
      confidence: body.confidence,
      timestamp: new Date(body.timestamp),
      userId,
    },
  });

  return c.json(attention);
});

// YouTube Attention - internal tracking only
app.post("/youtube", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    event: string;
    videoId: string | null;
    title?: string;
    channelName?: string;
    url?: string;
    caption?: string;
    activeWatchTime?: number;
    timestamp: number;
  }>();

  const attention = await db.youtubeAttention.create({
    data: {
      videoId: body.videoId,
      event: body.event,
      title: body.title || null,
      channelName: body.channelName || null,
      url: body.url || null,
      caption: body.caption || null,
      activeWatchTime: body.activeWatchTime || null,
      timestamp: new Date(body.timestamp),
      userId,
    },
  });

  return c.json(attention);
});

// Active Tab - sync currently focused website
app.post("/active-tab", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    url: string | null;
    title: string | null;
    timestamp: number;
  }>();

  const settings = await db.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      currentActiveUrl: body.url,
      currentActiveTitle: body.title,
      currentActiveAt: body.url ? new Date(body.timestamp) : null,
    },
    update: {
      currentActiveUrl: body.url,
      currentActiveTitle: body.title,
      currentActiveAt: body.url ? new Date(body.timestamp) : null,
    },
  });

  // Emit SSE event for active tab change
  events.emitActiveTabChanged({
    userId,
    url: body.url,
    title: body.title,
    timestamp: body.timestamp,
  });

  return c.json({ success: true, url: settings.currentActiveUrl });
});

export default app;
