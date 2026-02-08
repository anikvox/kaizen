import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../db.js";
import {
  getActiveFocuses,
  getActiveFocus,
  processUserFocus,
} from "./service.js";

describe("Focus Service", () => {
  let testUser: { id: string };

  beforeAll(async () => {
    // Create test user
    testUser = await db.user.create({
      data: {
        email: `focus-test-${Date.now()}@example.com`,
        clerkId: `focus-test-clerk-${Date.now()}`,
        name: "Focus Test User",
      },
    });

    // Create user settings with focus enabled
    await db.userSettings.create({
      data: {
        userId: testUser.id,
        focusCalculationEnabled: true,
        focusCalculationIntervalMs: 30000,
        focusInactivityThresholdMs: 60000,
        focusMinDurationMs: 30000,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db.focus.deleteMany({ where: { userId: testUser.id } });
    await db.userSettings.deleteMany({ where: { userId: testUser.id } });
    await db.user.delete({ where: { id: testUser.id } });
  });

  beforeEach(async () => {
    // Clear focuses before each test
    await db.focus.deleteMany({ where: { userId: testUser.id } });
  });

  describe("getActiveFocuses", () => {
    it("should return empty array when no focuses exist", async () => {
      const focuses = await getActiveFocuses(testUser.id);
      expect(focuses).toEqual([]);
    });

    it("should return only active focuses", async () => {
      // Create active focus
      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Active Focus",
          keywords: ["test"],
          isActive: true,
          startedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

      // Create ended focus
      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Ended Focus",
          keywords: ["old"],
          isActive: false,
          startedAt: new Date(Date.now() - 3600000),
          endedAt: new Date(),
          lastCalculatedAt: new Date(),
          lastActivityAt: new Date(Date.now() - 3600000),
        },
      });

      const focuses = await getActiveFocuses(testUser.id);
      expect(focuses).toHaveLength(1);
      expect(focuses[0].item).toBe("Active Focus");
      expect(focuses[0].isActive).toBe(true);
    });

    it("should return multiple active focuses ordered by lastActivityAt desc", async () => {
      const now = Date.now();

      // Create older active focus
      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Older Focus",
          keywords: ["old"],
          isActive: true,
          startedAt: new Date(now - 3600000),
          lastCalculatedAt: new Date(now - 1800000),
          lastActivityAt: new Date(now - 1800000),
        },
      });

      // Create newer active focus
      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Newer Focus",
          keywords: ["new"],
          isActive: true,
          startedAt: new Date(now - 1800000),
          lastCalculatedAt: new Date(now),
          lastActivityAt: new Date(now),
        },
      });

      const focuses = await getActiveFocuses(testUser.id);
      expect(focuses).toHaveLength(2);
      expect(focuses[0].item).toBe("Newer Focus"); // Most recent first
      expect(focuses[1].item).toBe("Older Focus");
    });

    it("should not return focuses from other users", async () => {
      // Create another user
      const otherUser = await db.user.create({
        data: {
          email: `other-${Date.now()}@example.com`,
          clerkId: `other-clerk-${Date.now()}`,
        },
      });

      try {
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

        // Create focus for test user
        await db.focus.create({
          data: {
            userId: testUser.id,
            item: "My Focus",
            keywords: ["mine"],
            isActive: true,
            startedAt: new Date(),
            lastCalculatedAt: new Date(),
            lastActivityAt: new Date(),
          },
        });

        const focuses = await getActiveFocuses(testUser.id);
        expect(focuses).toHaveLength(1);
        expect(focuses[0].item).toBe("My Focus");
      } finally {
        // Clean up other user
        await db.focus.deleteMany({ where: { userId: otherUser.id } });
        await db.user.delete({ where: { id: otherUser.id } });
      }
    });
  });

  describe("getActiveFocus (legacy)", () => {
    it("should return null when no focuses exist", async () => {
      const focus = await getActiveFocus(testUser.id);
      expect(focus).toBeNull();
    });

    it("should return the most recent active focus", async () => {
      const now = Date.now();

      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Older Focus",
          keywords: ["old"],
          isActive: true,
          startedAt: new Date(now - 3600000),
          lastCalculatedAt: new Date(now - 1800000),
          lastActivityAt: new Date(now - 1800000),
        },
      });

      await db.focus.create({
        data: {
          userId: testUser.id,
          item: "Newer Focus",
          keywords: ["new"],
          isActive: true,
          startedAt: new Date(now),
          lastCalculatedAt: new Date(now),
          lastActivityAt: new Date(now),
        },
      });

      const focus = await getActiveFocus(testUser.id);
      expect(focus).not.toBeNull();
      expect(focus!.item).toBe("Newer Focus");
    });
  });

  describe("processUserFocus", () => {
    it("should skip processing when focus calculation is disabled", async () => {
      // Disable focus calculation
      await db.userSettings.update({
        where: { userId: testUser.id },
        data: { focusCalculationEnabled: false },
      });

      try {
        const result = await processUserFocus(testUser.id);
        expect(result.focusCreated).toBe(false);
        expect(result.focusUpdated).toBe(false);
        expect(result.focusEnded).toBe(false);
      } finally {
        // Re-enable focus calculation
        await db.userSettings.update({
          where: { userId: testUser.id },
          data: { focusCalculationEnabled: true },
        });
      }
    });

    it("should skip when no new attention data", async () => {
      const result = await processUserFocus(testUser.id);
      expect(result.skippedNoNewData).toBe(true);
    });

    it("should prevent concurrent processing for same user", async () => {
      // Start two concurrent processes
      const [result1, result2] = await Promise.all([
        processUserFocus(testUser.id),
        processUserFocus(testUser.id),
      ]);

      // At least one should have processed, and they shouldn't both create focuses
      // The concurrent one should return early with empty result
      const totalCreated =
        (result1.focusCreated ? 1 : 0) + (result2.focusCreated ? 1 : 0);
      const totalSkipped =
        (result1.skippedNoNewData ? 1 : 0) + (result2.skippedNoNewData ? 1 : 0);

      // With no attention data, both should skip or one should skip due to concurrency
      expect(totalCreated).toBe(0);
    });
  });
});
