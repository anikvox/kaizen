import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "crypto";
import app from "../app.js";
import { db } from "../lib/index.js";

describe("Focus API E2E Tests", () => {
  let testUser: { id: string; email: string };
  let testDeviceToken: string;

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
    const email = `focus-e2e-${Date.now()}@example.com`;
    testUser = await db.user.create({
      data: {
        email,
        clerkId: `focus-e2e-clerk-${Date.now()}`,
        name: "Focus E2E Test User",
      },
    });

    // Create device token for auth
    testDeviceToken = crypto.randomBytes(32).toString("hex");
    await db.deviceToken.create({
      data: {
        token: testDeviceToken,
        userId: testUser.id,
        name: "Focus E2E Test Device",
      },
    });

    // Create user settings
    await db.userSettings.create({
      data: {
        userId: testUser.id,
        focusCalculationEnabled: true,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db.focus.deleteMany({ where: { userId: testUser.id } });
    await db.userSettings.deleteMany({ where: { userId: testUser.id } });
    await db.deviceToken.deleteMany({ where: { userId: testUser.id } });
    await db.user.delete({ where: { id: testUser.id } });
  });

  beforeEach(async () => {
    // Clear focuses before each test
    await db.focus.deleteMany({ where: { userId: testUser.id } });
  });

  describe("GET /focus - List Focus History", () => {
    it("should return 401 without auth", async () => {
      const res = await app.request("/focus");
      expect(res.status).toBe(401);
    });

    it("should return empty array initially", async () => {
      const res = await authFetch("/focus");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.focuses).toEqual([]);
    });

    it("should return focus history", async () => {
      // Create some focuses
      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "React Development",
          keywords: ["react", "hooks", "components"],
          isActive: true,
          startedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Python Learning",
          keywords: ["python", "tutorial"],
          isActive: false,
          startedAt: new Date(Date.now() - 3600000),
          endedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(Date.now() - 3600000),
        },
      });

      const res = await authFetch("/focus");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.focuses).toHaveLength(2);
    });

    it("should respect limit parameter", async () => {
      // Create 5 focuses
      for (let i = 0; i < 5; i++) {
        await db.focus.create({
          data: {
            userId: testUser.id,
            item: `Focus ${i}`,
            keywords: [`keyword${i}`],
            isActive: false,
            startedAt: new Date(Date.now() - i * 3600000),
            endedAt: new Date(),
            lastCalculatedAt: new Date(),
            lastActivityAt: new Date(Date.now() - i * 3600000),
          },
        });
      }

      const res = await authFetch("/focus?limit=3");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.focuses).toHaveLength(3);
    });

    it("should filter out active focuses when includeActive=false", async () => {
      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Active Focus",
          keywords: ["active"],
          isActive: true,
          startedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Ended Focus",
          keywords: ["ended"],
          isActive: false,
          startedAt: new Date(Date.now() - 3600000),
          endedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(Date.now() - 3600000),
        },
      });

      const res = await authFetch("/focus?includeActive=false");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.focuses).toHaveLength(1);
      expect(data.focuses[0].item).toBe("Ended Focus");
    });
  });

  describe("GET /focus/active - Get Active Focuses", () => {
    it("should return 401 without auth", async () => {
      const res = await app.request("/focus/active");
      expect(res.status).toBe(401);
    });

    it("should return empty array when no active focuses", async () => {
      const res = await authFetch("/focus/active");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.focuses).toEqual([]);
    });

    it("should return all active focuses", async () => {
      // Create active focuses
      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "React Development",
          keywords: ["react"],
          isActive: true,
          startedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "API Design",
          keywords: ["api"],
          isActive: true,
          startedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

      // Create ended focus (should not be returned)
      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Old Task",
          keywords: ["old"],
          isActive: false,
          startedAt: new Date(Date.now() - 3600000),
          endedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(Date.now() - 3600000),
        },
      });

      const res = await authFetch("/focus/active");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.focuses).toHaveLength(2);
      expect(data.focuses.every((f: any) => f.isActive)).toBe(true);
    });

    it("should return focus with correct shape", async () => {
      const now = new Date();
      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Test Focus",
          keywords: ["test", "keywords"],
          isActive: true,
          startedAt: now,
          lastCalculatedAt: now,
          lastActivityAt: now,
        },
      });

      const res = await authFetch("/focus/active");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.focuses).toHaveLength(1);

      const focus = data.focuses[0];
      expect(focus).toHaveProperty("id");
      expect(focus).toHaveProperty("item", "Test Focus");
      expect(focus).toHaveProperty("keywords", ["test", "keywords"]);
      expect(focus).toHaveProperty("isActive", true);
      expect(focus).toHaveProperty("startedAt");
      expect(focus).toHaveProperty("endedAt", null);
      expect(focus).toHaveProperty("lastActivityAt");
    });
  });

  describe("GET /focus/:id - Get Focus by ID", () => {
    it("should return 401 without auth", async () => {
      const res = await app.request("/focus/some-id");
      expect(res.status).toBe(401);
    });

    it("should return 404 for non-existent focus", async () => {
      const res = await authFetch("/focus/non-existent-id");
      expect(res.status).toBe(404);
    });

    it("should return focus by ID", async () => {
      const focus = await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Specific Focus",
          keywords: ["specific"],
          isActive: true,
          startedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

      const res = await authFetch(`/focus/${focus.id}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.focus.id).toBe(focus.id);
      expect(data.focus.item).toBe("Specific Focus");
    });

    it("should not return focus from another user", async () => {
      // Create another user
      const otherUser = await db.user.create({
        data: {
          email: `other-focus-${Date.now()}@example.com`,
          clerkId: `other-focus-clerk-${Date.now()}`,
        },
      });

      try {
        const focus = await db.focus.create({
          data: {
            userId: otherUser.id,
            item: "Other User Focus",
            keywords: ["other"],
            isActive: true,
            startedAt: new Date(),
            lastCalculatedAt: new Date(),
            lastActivityAt: new Date(),
          },
        });

        const res = await authFetch(`/focus/${focus.id}`);
        expect(res.status).toBe(404);
      } finally {
        await db.focus.deleteMany({ where: { userId: otherUser.id } });
        await db.user.delete({ where: { id: otherUser.id } });
      }
    });
  });

  describe("POST /focus/end - End Active Focus", () => {
    it("should return 401 without auth", async () => {
      const res = await app.request("/focus/end", { method: "POST" });
      expect(res.status).toBe(401);
    });

    it("should return 404 when no active focus", async () => {
      const res = await authFetch("/focus/end", { method: "POST" });
      expect(res.status).toBe(404);
    });

    it("should end active focus", async () => {
      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Focus to End",
          keywords: ["end"],
          isActive: true,
          startedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

      const res = await authFetch("/focus/end", { method: "POST" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.focus.isActive).toBe(false);
      expect(data.focus.endedAt).not.toBeNull();

      // Verify in database
      const focuses = await db.focus.findMany({
        where: { userId: testUser.id, isActive: true },
      });
      expect(focuses).toHaveLength(0);
    });
  });

  describe("User isolation", () => {
    it("should not leak focuses between users", async () => {
      // Create another user with their own token
      const otherUser = await db.user.create({
        data: {
          email: `isolation-${Date.now()}@example.com`,
          clerkId: `isolation-clerk-${Date.now()}`,
        },
      });

      const otherToken = crypto.randomBytes(32).toString("hex");
      await db.deviceToken.create({
        data: {
          token: otherToken,
          userId: otherUser.id,
          name: "Other Test Device",
        },
      });

      try {
        // Create focus for test user
        await db.focus.create({
          data: {
            userId: testUser.id,
            item: "Test User Focus",
            keywords: ["test"],
            isActive: true,
            startedAt: new Date(),
            lastCalculatedAt: new Date(),
            lastActivityAt: new Date(),
          },
        });

        // Create focus for other user
        await db.focus.create({
          data: {
            userId: otherUser.id,
            item: "Other User Focus",
            keywords: ["other"],
            isActive: true,
            startedAt: new Date(),
            lastCalculatedAt: new Date(),
            lastActivityAt: new Date(),
          },
        });

        // Test user should only see their focus
        const res1 = await authFetch("/focus/active");
        const data1 = await res1.json();
        expect(data1.focuses).toHaveLength(1);
        expect(data1.focuses[0].item).toBe("Test User Focus");

        // Other user should only see their focus
        const res2 = await app.request("/focus/active", {
          headers: {
            Authorization: `Bearer ${otherToken}`,
            "Content-Type": "application/json",
          },
        });
        const data2 = await res2.json();
        expect(data2.focuses).toHaveLength(1);
        expect(data2.focuses[0].item).toBe("Other User Focus");
      } finally {
        await db.focus.deleteMany({ where: { userId: otherUser.id } });
        await db.deviceToken.deleteMany({ where: { userId: otherUser.id } });
        await db.user.delete({ where: { id: otherUser.id } });
      }
    });
  });
});
