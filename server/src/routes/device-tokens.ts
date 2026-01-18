import { Router, Response } from "express";
import { randomBytes } from "crypto";
import prisma from "../lib/prisma";
import { AuthRequest, requireAuth } from "../middleware/auth";

const router = Router();

// Generate a secure device token with kz_ prefix
function generateDeviceToken(): string {
  return "kz_" + randomBytes(32).toString("hex");
}

// POST /device-tokens/link - Create or update a device token for an installation
// Called from the website when user confirms linking
router.post("/link", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { installationId, deviceName, userEmail, userName, userImage } = req.body;
    const userId = req.auth!.userId;

    if (!installationId) {
      return res.status(400).json({ error: "installationId is required" });
    }

    // Ensure user exists in our database (upsert from Clerk data)
    await prisma.user.upsert({
      where: { id: userId },
      update: {
        email: userEmail,
        name: userName,
        image: userImage,
      },
      create: {
        id: userId,
        email: userEmail || `${userId}@clerk.local`,
        name: userName,
        image: userImage,
      },
    });

    // Check if this installation already has a token
    const existing = await prisma.deviceToken.findUnique({
      where: { installationId },
    });

    if (existing) {
      // If it's already linked to this user, just return success
      if (existing.userId === userId) {
        return res.json({
          success: true,
          message: "Extension already linked to your account",
          linked: true,
        });
      }
      // If linked to a different user, update to new user
      const token = generateDeviceToken();
      await prisma.deviceToken.update({
        where: { installationId },
        data: {
          userId,
          token,
          deviceName: deviceName || existing.deviceName,
        },
      });
      return res.json({
        success: true,
        message: "Extension linked to your account",
        linked: true,
      });
    }

    // Create new device token
    const token = generateDeviceToken();
    await prisma.deviceToken.create({
      data: {
        installationId,
        token,
        deviceName: deviceName || "Chrome Extension",
        userId,
      },
    });

    res.json({
      success: true,
      message: "Extension successfully linked to your account",
      linked: true,
    });
  } catch (error) {
    console.error("Error linking device:", error);
    res.status(500).json({ error: "Failed to link extension" });
  }
});

// GET /device-tokens/status/:installationId - Check if an installation is linked
// Called by extension to check if it's been linked (polling or on popup open)
router.get("/status/:installationId", async (req, res) => {
  try {
    const { installationId } = req.params;

    const deviceToken = await prisma.deviceToken.findUnique({
      where: { installationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
          },
        },
      },
    });

    if (!deviceToken) {
      return res.json({
        linked: false,
        token: null,
        user: null,
      });
    }

    res.json({
      linked: true,
      token: deviceToken.token,
      user: {
        email: deviceToken.user.email,
        name: deviceToken.user.name,
        image: deviceToken.user.image,
      },
    });
  } catch (error) {
    console.error("Error checking device status:", error);
    res.status(500).json({ error: "Failed to check device status" });
  }
});

// DELETE /device-tokens/unlink - Unlink extension from current user
// Called from website or extension when user wants to unlink
router.delete("/unlink", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { installationId } = req.body;
    const userId = req.auth!.userId;

    if (!installationId) {
      return res.status(400).json({ error: "installationId is required" });
    }

    const deviceToken = await prisma.deviceToken.findUnique({
      where: { installationId },
    });

    if (!deviceToken) {
      return res.status(404).json({ error: "Device not found" });
    }

    if (deviceToken.userId !== userId) {
      return res.status(403).json({ error: "Not authorized to unlink this device" });
    }

    await prisma.deviceToken.delete({
      where: { installationId },
    });

    res.json({ success: true, message: "Extension unlinked successfully" });
  } catch (error) {
    console.error("Error unlinking device:", error);
    res.status(500).json({ error: "Failed to unlink extension" });
  }
});

// GET /device-tokens/my-devices - List all devices linked to current user
router.get("/my-devices", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;

    const devices = await prisma.deviceToken.findMany({
      where: { userId },
      select: {
        id: true,
        installationId: true,
        deviceName: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { lastUsedAt: "desc" },
    });

    res.json({ devices });
  } catch (error) {
    console.error("Error fetching devices:", error);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

export default router;
