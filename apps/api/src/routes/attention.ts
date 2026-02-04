import { Hono } from "hono";
import { db } from "../lib/index.js";
import { deviceAuthMiddleware, type DeviceAuthVariables } from "../middleware/index.js";

const app = new Hono<{ Variables: DeviceAuthVariables }>();

// Text Attention
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

app.get("/text", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;

  const attentions = await db.textAttention.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
    take: limit,
    skip: offset,
  });

  return c.json(attentions);
});

// Image Attention
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
  }>();

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
    },
  });

  return c.json(attention);
});

app.get("/image", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;

  const attentions = await db.imageAttention.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
    take: limit,
    skip: offset,
  });

  return c.json(attentions);
});

// Audio Attention
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

app.get("/audio", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;

  const attentions = await db.audioAttention.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
    take: limit,
    skip: offset,
  });

  return c.json(attentions);
});

// YouTube Attention
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

app.get("/youtube", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;

  const attentions = await db.youtubeAttention.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
    take: limit,
    skip: offset,
  });

  return c.json(attentions);
});

export default app;
