import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import app from "../app.js";
import { db } from "../lib/index.js";
import crypto from "crypto";

describe("Chat API E2E Tests", () => {
  let testUser: { id: string; email: string };
  let testDeviceToken: string;
  let testSessionId: string;

  // Helper to make authenticated requests
  const authFetch = (path: string, options: RequestInit = {}) => {
    return app.request(path, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${testDeviceToken}`,
        "Content-Type": "application/json",
      },
    });
  };

  beforeAll(async () => {
    // Create test user
    const email = `test-${Date.now()}@example.com`;
    testUser = await db.user.create({
      data: {
        email,
        clerkId: `test-clerk-${Date.now()}`,
        name: "Test User",
      },
    });

    // Create device token for auth
    testDeviceToken = crypto.randomBytes(32).toString("hex");
    await db.deviceToken.create({
      data: {
        token: testDeviceToken,
        userId: testUser.id,
        name: "Test Device",
      },
    });
  });

  afterAll(async () => {
    // Clean up: delete all test data
    await db.chatMessage.deleteMany({
      where: { session: { userId: testUser.id } },
    });
    await db.chatSession.deleteMany({
      where: { userId: testUser.id },
    });
    await db.deviceToken.deleteMany({
      where: { userId: testUser.id },
    });
    await db.user.delete({
      where: { id: testUser.id },
    });
  });

  describe("GET /chats - List Sessions", () => {
    it("should return 401 without auth", async () => {
      const res = await app.request("/chats");
      expect(res.status).toBe(401);
    });

    it("should return empty array initially", async () => {
      const res = await authFetch("/chats");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });
  });

  describe("POST /chats - Send Message", () => {
    it("should return 401 without auth", async () => {
      const res = await app.request("/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hello" }),
      });
      expect(res.status).toBe(401);
    });

    it("should return 400 without content", async () => {
      const res = await authFetch("/chats", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("should create new session when sessionId not provided", async () => {
      const res = await authFetch("/chats", {
        method: "POST",
        body: JSON.stringify({ content: "Hello, bot!" }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.isNewSession).toBe(true);
      expect(data.sessionId).toBeDefined();
      expect(data.userMessage.content).toBe("Hello, bot!");
      expect(data.userMessage.role).toBe("user");
      expect(data.userMessage.status).toBe("sent");
      expect(data.assistantMessage.role).toBe("assistant");
      expect(data.assistantMessage.status).toBe("typing");

      // Save for later tests
      testSessionId = data.sessionId;
    });

    it("should add message to existing session", async () => {
      const res = await authFetch("/chats", {
        method: "POST",
        body: JSON.stringify({
          sessionId: testSessionId,
          content: "Follow-up message",
        }),
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.isNewSession).toBe(false);
      expect(data.sessionId).toBe(testSessionId);
      expect(data.userMessage.content).toBe("Follow-up message");
    });

    it("should return 404 for non-existent session", async () => {
      const res = await authFetch("/chats", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "non-existent-id",
          content: "Test",
        }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /chats - List Sessions After Creation", () => {
    it("should return sessions after creation", async () => {
      const res = await authFetch("/chats");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      const session = data.find((s: any) => s.id === testSessionId);
      expect(session).toBeDefined();
      expect(session.title).toBe("New Chat");
      expect(session.messageCount).toBeGreaterThanOrEqual(4); // 2 user + 2 bot messages
    });
  });

  describe("GET /chats/:sessionId - Get Session", () => {
    it("should return 401 without auth", async () => {
      const res = await app.request(`/chats/${testSessionId}`);
      expect(res.status).toBe(401);
    });

    it("should return session with messages", async () => {
      const res = await authFetch(`/chats/${testSessionId}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.id).toBe(testSessionId);
      expect(data.title).toBe("New Chat");
      expect(Array.isArray(data.messages)).toBe(true);
      expect(data.messages.length).toBeGreaterThanOrEqual(4);

      // Check message structure
      const userMessage = data.messages.find((m: any) => m.role === "user");
      expect(userMessage).toBeDefined();
      expect(userMessage.content).toBeTruthy();
      expect(userMessage.status).toBe("sent");
    });

    it("should return 404 for non-existent session", async () => {
      const res = await authFetch("/chats/non-existent-id");
      expect(res.status).toBe(404);
    });
  });

  describe("Bot Response", () => {
    it("should have bot message progressing through states", async () => {
      // Bot response takes time: 1s typing + ~20-30 words at 1 word/sec
      // Poll until bot message is finished or timeout
      const maxWait = 35000; // 35 seconds max
      const pollInterval = 1000;
      let elapsed = 0;
      let botFinished = false;

      while (elapsed < maxWait && !botFinished) {
        const res = await authFetch(`/chats/${testSessionId}`);
        const data = await res.json();
        const assistantMessages = data.messages.filter(
          (m: any) => m.role === "assistant",
        );

        // Check if any bot message is finished
        const finishedAssistant = assistantMessages.find(
          (m: any) => m.status === "finished",
        );
        if (finishedAssistant) {
          botFinished = true;
          expect(finishedAssistant.content).toBeTruthy();
          expect(finishedAssistant.content.length).toBeGreaterThan(0);
        } else {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          elapsed += pollInterval;
        }
      }

      expect(botFinished).toBe(true);
    }, 40000); // 40 second timeout for this test
  });

  describe("DELETE /chats/:sessionId - Delete Session", () => {
    let sessionToDelete: string;

    beforeEach(async () => {
      // Create a session to delete
      const res = await authFetch("/chats", {
        method: "POST",
        body: JSON.stringify({ content: "Session to delete" }),
      });
      const data = await res.json();
      sessionToDelete = data.sessionId;
    });

    it("should return 401 without auth", async () => {
      const res = await app.request(`/chats/${sessionToDelete}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(401);
    });

    it("should delete session successfully", async () => {
      const res = await authFetch(`/chats/${sessionToDelete}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify session is deleted
      const getRes = await authFetch(`/chats/${sessionToDelete}`);
      expect(getRes.status).toBe(404);
    });

    it("should return 404 for non-existent session", async () => {
      const res = await authFetch("/chats/non-existent-id", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("Session Isolation", () => {
    let otherUser: { id: string };
    let otherUserToken: string;
    let otherUserSession: string;

    beforeAll(async () => {
      // Create another user
      otherUser = await db.user.create({
        data: {
          email: `other-${Date.now()}@example.com`,
          clerkId: `other-clerk-${Date.now()}`,
          name: "Other User",
        },
      });

      otherUserToken = crypto.randomBytes(32).toString("hex");
      await db.deviceToken.create({
        data: {
          token: otherUserToken,
          userId: otherUser.id,
          name: "Other Test Device",
        },
      });

      // Create a session for other user
      const res = await app.request("/chats", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${otherUserToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: "Other user message" }),
      });
      const data = await res.json();
      otherUserSession = data.sessionId;
    });

    afterAll(async () => {
      // Clean up other user data
      await db.chatMessage.deleteMany({
        where: { session: { userId: otherUser.id } },
      });
      await db.chatSession.deleteMany({
        where: { userId: otherUser.id },
      });
      await db.deviceToken.deleteMany({
        where: { userId: otherUser.id },
      });
      await db.user.delete({
        where: { id: otherUser.id },
      });
    });

    it("should not list other user sessions", async () => {
      const res = await authFetch("/chats");
      const data = await res.json();

      const otherSession = data.find((s: any) => s.id === otherUserSession);
      expect(otherSession).toBeUndefined();
    });

    it("should not access other user session", async () => {
      const res = await authFetch(`/chats/${otherUserSession}`);
      expect(res.status).toBe(404);
    });

    it("should not delete other user session", async () => {
      const res = await authFetch(`/chats/${otherUserSession}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });

    it("should not send message to other user session", async () => {
      const res = await authFetch("/chats", {
        method: "POST",
        body: JSON.stringify({
          sessionId: otherUserSession,
          content: "Trying to hijack",
        }),
      });
      expect(res.status).toBe(404);
    });
  });
});
