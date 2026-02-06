import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createApiClient, ApiClient } from "../src/index.js";

const API_URL = process.env.API_URL || "http://localhost:60092";
const DEVICE_TOKEN = process.env.DEVICE_TOKEN;

describe("Attention Data E2E Tests", () => {
  let client: ApiClient;

  beforeAll(() => {
    client = createApiClient(API_URL, async () => DEVICE_TOKEN || null);
  });

  beforeEach(() => {
    if (!DEVICE_TOKEN) {
      throw new Error(
        "DEVICE_TOKEN environment variable is required. " +
        "Set it to a valid device token to run attention tests."
      );
    }
  });

  describe("Text Attention", () => {
    it("should create text attention data", async () => {
      const timestamp = Date.now();
      const testData = {
        url: "https://example.com/article",
        text: "This is a test paragraph that the user read on the page. It contains important information about the topic being discussed.",
        wordsRead: 22,
        timestamp,
      };

      const created = await client.attention.text(testData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.url).toBe(testData.url);
      expect(created.text).toBe(testData.text);
      expect(created.wordsRead).toBe(testData.wordsRead);
    });
  });

  describe("Image Attention", () => {
    it("should create image attention data", async () => {
      const timestamp = Date.now();
      const testData = {
        url: "https://example.com/gallery",
        src: "https://example.com/images/photo.jpg",
        alt: "A beautiful landscape photo",
        title: "Mountain Sunset",
        width: 1920,
        height: 1080,
        hoverDuration: 3500,
        confidence: 85,
        timestamp,
      };

      const created = await client.attention.image(testData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.url).toBe(testData.url);
      expect(created.src).toBe(testData.src);
      expect(created.alt).toBe(testData.alt);
      expect(created.hoverDuration).toBe(testData.hoverDuration);
    });
  });

  describe("Audio Attention", () => {
    it("should create audio attention data", async () => {
      const timestamp = Date.now();
      const testData = {
        url: "https://example.com/podcast",
        src: "https://example.com/audio/episode.mp3",
        title: "Tech Talk Episode 42",
        duration: 3600,
        playbackDuration: 1800000,
        currentTime: 1800,
        confidence: 90,
        timestamp,
      };

      const created = await client.attention.audio(testData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.url).toBe(testData.url);
      expect(created.src).toBe(testData.src);
      expect(created.title).toBe(testData.title);
      expect(created.playbackDuration).toBe(testData.playbackDuration);
    });
  });

  describe("YouTube Attention", () => {
    it("should create YouTube attention data", async () => {
      const timestamp = Date.now();
      const videoId = "dQw4w9WgXcQ";

      // Create opened event
      const openedData = {
        event: "opened" as const,
        videoId,
        title: "Test Video Title",
        channelName: "Test Channel",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        timestamp,
      };

      const opened = await client.attention.youtube(openedData);
      expect(opened).toBeDefined();
      expect(opened.event).toBe("opened");
      expect(opened.videoId).toBe(videoId);

      // Create caption event
      const captionData = {
        event: "caption" as const,
        videoId,
        caption: "This is what the person said in the video",
        timestamp: timestamp + 1000,
      };

      const caption = await client.attention.youtube(captionData);
      expect(caption).toBeDefined();
      expect(caption.event).toBe("caption");
      expect(caption.caption).toBe(captionData.caption);

      // Create watch time update
      const watchTimeData = {
        event: "active-watch-time-update" as const,
        videoId,
        activeWatchTime: 120000,
        timestamp: timestamp + 2000,
      };

      const watchTime = await client.attention.youtube(watchTimeData);
      expect(watchTime).toBeDefined();
      expect(watchTime.event).toBe("active-watch-time-update");
      expect(watchTime.activeWatchTime).toBe(120000);
    });
  });
});
