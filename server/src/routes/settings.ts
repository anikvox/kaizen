import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth";

const router = Router();

// Default settings values
const DEFAULT_SETTINGS = {
  sustainedTime: 3000,
  idleThreshold: 30000,
  wordsPerMinute: 150,
  debugMode: false,
  showOverlay: false,
  itemsThreshold: 5,
  timeWindow: 300000,
  focusInactivityThreshold: 300000,
  gcInterval: 172800000,
  modelTemperature: 1.0,
  modelTopP: 0.95,
};

// Helper to ensure user exists
async function ensureUser(clerkId: string) {
  const user = await prisma.user.findUnique({ where: { id: clerkId } });
  if (!user) {
    await prisma.user.create({
      data: {
        id: clerkId,
        email: "unknown@example.com",
      },
    });
  }
}

// Helper to get or create settings for a user
async function getOrCreateSettings(userId: string) {
  await ensureUser(userId);

  let settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (!settings) {
    settings = await prisma.userSettings.create({
      data: {
        userId,
        ...DEFAULT_SETTINGS,
      },
    });
  }

  return settings;
}

// Format settings for API response (exclude internal fields)
function formatSettingsResponse(settings: {
  sustainedTime: number;
  idleThreshold: number;
  wordsPerMinute: number;
  debugMode: boolean;
  showOverlay: boolean;
  itemsThreshold: number;
  timeWindow: number;
  focusInactivityThreshold: number;
  gcInterval: number;
  modelTemperature: number;
  modelTopP: number;
  version: number;
}) {
  return {
    sustainedTime: settings.sustainedTime,
    idleThreshold: settings.idleThreshold,
    wordsPerMinute: settings.wordsPerMinute,
    debugMode: settings.debugMode,
    showOverlay: settings.showOverlay,
    itemsThreshold: settings.itemsThreshold,
    timeWindow: settings.timeWindow,
    focusInactivityThreshold: settings.focusInactivityThreshold,
    gcInterval: settings.gcInterval,
    modelTemperature: settings.modelTemperature,
    modelTopP: settings.modelTopP,
    version: settings.version,
  };
}

// GET /settings - Get user settings
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const settings = await getOrCreateSettings(userId);
    res.json(formatSettingsResponse(settings));
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// POST /settings - Save user settings
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const {
      sustainedTime,
      idleThreshold,
      wordsPerMinute,
      debugMode,
      showOverlay,
      itemsThreshold,
      timeWindow,
      focusInactivityThreshold,
      gcInterval,
      modelTemperature,
      modelTopP,
    } = req.body;

    await ensureUser(userId);

    // Get current settings to increment version
    const currentSettings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    const nextVersion = (currentSettings?.version ?? 0) + 1;

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        sustainedTime: sustainedTime ?? DEFAULT_SETTINGS.sustainedTime,
        idleThreshold: idleThreshold ?? DEFAULT_SETTINGS.idleThreshold,
        wordsPerMinute: wordsPerMinute ?? DEFAULT_SETTINGS.wordsPerMinute,
        debugMode: debugMode ?? DEFAULT_SETTINGS.debugMode,
        showOverlay: showOverlay ?? DEFAULT_SETTINGS.showOverlay,
        itemsThreshold: itemsThreshold ?? DEFAULT_SETTINGS.itemsThreshold,
        timeWindow: timeWindow ?? DEFAULT_SETTINGS.timeWindow,
        focusInactivityThreshold: focusInactivityThreshold ?? DEFAULT_SETTINGS.focusInactivityThreshold,
        gcInterval: gcInterval ?? DEFAULT_SETTINGS.gcInterval,
        modelTemperature: modelTemperature ?? DEFAULT_SETTINGS.modelTemperature,
        modelTopP: modelTopP ?? DEFAULT_SETTINGS.modelTopP,
        version: 1,
      },
      update: {
        ...(sustainedTime !== undefined && { sustainedTime }),
        ...(idleThreshold !== undefined && { idleThreshold }),
        ...(wordsPerMinute !== undefined && { wordsPerMinute }),
        ...(debugMode !== undefined && { debugMode }),
        ...(showOverlay !== undefined && { showOverlay }),
        ...(itemsThreshold !== undefined && { itemsThreshold }),
        ...(timeWindow !== undefined && { timeWindow }),
        ...(focusInactivityThreshold !== undefined && { focusInactivityThreshold }),
        ...(gcInterval !== undefined && { gcInterval }),
        ...(modelTemperature !== undefined && { modelTemperature }),
        ...(modelTopP !== undefined && { modelTopP }),
        version: nextVersion,
      },
    });

    res.json(formatSettingsResponse(settings));
  } catch (error) {
    console.error("Error saving settings:", error);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// GET /settings/sync - Long polling endpoint for settings sync
// Extension calls this with ?version=X and waits for changes
router.get("/sync", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const clientVersion = parseInt(req.query.version as string) || 0;
    const timeout = Math.min(parseInt(req.query.timeout as string) || 30000, 60000); // Max 60s

    const startTime = Date.now();
    const pollInterval = 1000; // Check every second

    // Polling loop
    const checkForUpdates = async (): Promise<void> => {
      const settings = await getOrCreateSettings(userId);

      // If server version is newer, return immediately
      if (settings.version > clientVersion) {
        res.json({
          updated: true,
          settings: formatSettingsResponse(settings),
        });
        return;
      }

      // Check if we've exceeded timeout
      if (Date.now() - startTime >= timeout) {
        res.json({
          updated: false,
          settings: formatSettingsResponse(settings),
        });
        return;
      }

      // Wait and check again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      // Check if client disconnected
      if (res.headersSent) {
        return;
      }

      return checkForUpdates();
    };

    // Handle client disconnect
    req.on("close", () => {
      // Client disconnected, stop polling
    });

    await checkForUpdates();
  } catch (error) {
    console.error("Error in settings sync:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to sync settings" });
    }
  }
});

export default router;
