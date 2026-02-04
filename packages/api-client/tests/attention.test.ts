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
    it("should create and retrieve text attention data", async () => {
      const timestamp = Date.now();
      const testData = {
        url: "https://example.com/article",
        text: "This is a test paragraph that the user read on the page. It contains important information about the topic being discussed.",
        wordsRead: 22,
        timestamp,
      };

      // Create text attention
      const created = await client.attention.text(testData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.url).toBe(testData.url);
      expect(created.text).toBe(testData.text);
      expect(created.wordsRead).toBe(testData.wordsRead);

      // List text attentions
      const list = await client.attention.listText();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);

      const found = list.find((t) => t.id === created.id);
      expect(found).toBeDefined();
    });
  });

  describe("Image Attention", () => {
    it("should create and retrieve image attention data", async () => {
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

      // Create image attention
      const created = await client.attention.image(testData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.url).toBe(testData.url);
      expect(created.src).toBe(testData.src);
      expect(created.alt).toBe(testData.alt);
      expect(created.hoverDuration).toBe(testData.hoverDuration);

      // List image attentions
      const list = await client.attention.listImage();
      expect(Array.isArray(list)).toBe(true);

      const found = list.find((i) => i.id === created.id);
      expect(found).toBeDefined();
    });
  });

  describe("Audio Attention", () => {
    it("should create and retrieve audio attention data", async () => {
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

      // Create audio attention
      const created = await client.attention.audio(testData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.url).toBe(testData.url);
      expect(created.src).toBe(testData.src);
      expect(created.title).toBe(testData.title);
      expect(created.playbackDuration).toBe(testData.playbackDuration);

      // List audio attentions
      const list = await client.attention.listAudio();
      expect(Array.isArray(list)).toBe(true);

      const found = list.find((a) => a.id === created.id);
      expect(found).toBeDefined();
    });
  });

  describe("YouTube Attention", () => {
    it("should create and retrieve YouTube attention data", async () => {
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

      // List YouTube attentions
      const list = await client.attention.listYoutube();
      expect(Array.isArray(list)).toBe(true);

      const foundOpened = list.find((y) => y.id === opened.id);
      expect(foundOpened).toBeDefined();
    });
  });

  describe("Export Attention", () => {
    it("should export attention data in clean format", async () => {
      // First, create some test data across all types
      const timestamp = Date.now();
      const testUrl = `https://test-export-${timestamp}.example.com/page`;

      // Create website visit (this requires a separate endpoint, so we'll test with existing data)
      // Create text attention
      await client.attention.text({
        url: testUrl,
        text: "Export test paragraph content",
        wordsRead: 4,
        timestamp,
      });

      // Create image attention
      await client.attention.image({
        url: testUrl,
        src: "https://example.com/export-test.jpg",
        alt: "Export test image",
        title: "Test",
        width: 800,
        height: 600,
        hoverDuration: 2000,
        confidence: 80,
        timestamp,
      });

      // Now fetch the exported data
      // Note: Export endpoint uses Clerk auth, so this will only work if
      // the DEVICE_TOKEN is a Clerk token. For device tokens, we test the raw attention endpoints.
      // This test demonstrates the expected structure.

      // The export endpoint requires Clerk authentication (not device token)
      // So we verify the attention data was created correctly via the list endpoints

      const textList = await client.attention.listText();
      const imageList = await client.attention.listImage();

      const textFound = textList.find((t) => t.url === testUrl);
      const imageFound = imageList.find((i) => i.url === testUrl);

      expect(textFound).toBeDefined();
      expect(imageFound).toBeDefined();

      // Verify the data structure is correct for LLM consumption
      if (textFound) {
        expect(typeof textFound.text).toBe("string");
        expect(typeof textFound.wordsRead).toBe("number");
        expect(typeof textFound.timestamp).toBe("string");
      }

      if (imageFound) {
        expect(typeof imageFound.src).toBe("string");
        expect(typeof imageFound.hoverDuration).toBe("number");
      }
    });
  });

  describe("Attention Data Structure Validation", () => {
    it("should have consistent data structure across all attention types", async () => {
      const textList = await client.attention.listText();
      const imageList = await client.attention.listImage();
      const audioList = await client.attention.listAudio();
      const youtubeList = await client.attention.listYoutube();

      // All lists should be arrays
      expect(Array.isArray(textList)).toBe(true);
      expect(Array.isArray(imageList)).toBe(true);
      expect(Array.isArray(audioList)).toBe(true);
      expect(Array.isArray(youtubeList)).toBe(true);

      // Verify common fields exist on all items
      if (textList.length > 0) {
        const item = textList[0];
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("url");
        expect(item).toHaveProperty("timestamp");
        expect(item).toHaveProperty("createdAt");
      }

      if (imageList.length > 0) {
        const item = imageList[0];
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("url");
        expect(item).toHaveProperty("timestamp");
        expect(item).toHaveProperty("createdAt");
      }

      if (audioList.length > 0) {
        const item = audioList[0];
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("url");
        expect(item).toHaveProperty("timestamp");
        expect(item).toHaveProperty("createdAt");
      }

      if (youtubeList.length > 0) {
        const item = youtubeList[0];
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("event");
        expect(item).toHaveProperty("timestamp");
        expect(item).toHaveProperty("createdAt");
      }
    });
  });
});
