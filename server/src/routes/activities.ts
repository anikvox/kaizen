import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth";

const router = Router();

// Helper to ensure user exists in our DB
async function ensureUser(clerkId: string) {
  const user = await prisma.user.findUnique({ where: { id: clerkId } });
  if (!user) {
    // In a real app, you might get more info from Clerk SDK here
    await prisma.user.create({
      data: {
        id: clerkId,
        email: "unknown@example.com", // This should be updated via webhook or Clerk SDK
      },
    });
  }
}

// =============================================================================
// WEBSITE VISIT ROUTES
// =============================================================================

interface WebsiteVisitOpenedBody {
  event: "opened";
  url: string;
  title: string;
  metadata?: Record<string, string>;
  referrer?: string;
  timestamp: number;
}

interface WebsiteVisitActiveTimeBody {
  event: "active-time-update";
  url: string;
  time: number; // Active time in milliseconds
  timestamp: number;
}

interface WebsiteVisitClosedBody {
  event: "closed";
  url: string;
  time: number;
  timestamp: number;
}

type WebsiteVisitBody = WebsiteVisitOpenedBody | WebsiteVisitActiveTimeBody | WebsiteVisitClosedBody;

// GET /activities/website - List all website visits for current user
router.get("/website", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const visits = await prisma.websiteVisit.findMany({
      where: { userId },
      orderBy: { openedAt: "desc" },
    });
    res.json(visits);
  } catch (error) {
    console.error("Error fetching website visits:", error);
    res.status(500).json({ error: "Failed to fetch website visits" });
  }
});

// POST /activities/website - Handle website visit events (opened, active-time-update, closed)
router.post("/website", async (req: AuthRequest<{}, {}, WebsiteVisitBody>, res: Response) => {
  try {
    const body = req.body;
    const userId = req.auth!.userId;

    if (!body.event || !body.url) {
      res.status(400).json({ error: "event and url are required" });
      return;
    }

    await ensureUser(userId);

    switch (body.event) {
      case "opened": {
        // Upsert: create or update if URL already exists for this user
        const visit = await prisma.websiteVisit.upsert({
          where: {
            url: body.url,
          },
          create: {
            url: body.url,
            title: body.title,
            metadata: body.metadata || {},
            openedAt: new Date(body.timestamp),
            referrer: body.referrer === body.url ? null : body.referrer,
            activeTime: 0,
            userId,
          },
          update: {
            title: body.title,
            metadata: body.metadata || {},
            openedAt: new Date(body.timestamp),
            referrer: body.referrer === body.url ? null : body.referrer,
            closedAt: null, // Reset closed time on re-open
            activeTime: 0,  // Reset active time on re-open
          },
        });
        res.status(201).json(visit);
        break;
      }
      case "active-time-update": {
        const visit = await prisma.websiteVisit.updateMany({
          where: { url: body.url, userId },
          data: {
            activeTime: body.time,
          },
        });
        if (visit.count === 0) {
          res.status(404).json({ error: "Website visit not found" });
          return;
        }
        res.json({ success: true, updated: visit.count });
        break;
      }
      case "closed": {
        const visit = await prisma.websiteVisit.updateMany({
          where: { url: body.url, userId },
          data: {
            closedAt: new Date(body.timestamp),
            activeTime: body.time,
          },
        });
        if (visit.count === 0) {
          res.status(404).json({ error: "Website visit not found" });
          return;
        }
        res.json({ success: true, updated: visit.count });
        break;
      }
      default:
        res.status(400).json({ error: "Invalid event type" });
    }
  } catch (error) {
    console.error("Error handling website visit:", error);
    res.status(500).json({ error: "Failed to handle website visit" });
  }
});

// DELETE /activities/website/:id - Delete a website visit
router.delete("/website/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = req.auth!.userId;

    const existing = await prisma.websiteVisit.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: "Website visit not found" });
      return;
    }

    await prisma.websiteVisit.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting website visit:", error);
    res.status(500).json({ error: "Failed to delete website visit" });
  }
});

// =============================================================================
// TEXT ATTENTION ROUTES
// =============================================================================

interface CreateTextAttentionBody {
  url: string;
  text: string;
}

// GET /activities/text - List all text attention activities for current user
router.get("/text", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const activities = await prisma.textAttention.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
    });
    res.json(activities);
  } catch (error) {
    console.error("Error fetching text activities:", error);
    res.status(500).json({ error: "Failed to fetch text activities" });
  }
});

// GET /activities/text/:id - Get a single text attention activity
router.get("/text/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = req.auth!.userId;
    const activity = await prisma.textAttention.findUnique({
      where: { id, userId },
    });

    if (!activity) {
      res.status(404).json({ error: "Text activity not found" });
      return;
    }

    res.json(activity);
  } catch (error) {
    console.error("Error fetching text activity:", error);
    res.status(500).json({ error: "Failed to fetch text activity" });
  }
});

// POST /activities/text - Create a new text attention activity
router.post("/text", async (req: AuthRequest<{}, {}, CreateTextAttentionBody>, res: Response) => {
  try {
    const { url, text } = req.body;
    const userId = req.auth!.userId;

    if (!url || !text) {
      res.status(400).json({ error: "url and text are required" });
      return;
    }

    await ensureUser(userId);

    const activity = await prisma.textAttention.create({
      data: { url, text, userId },
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error("Error creating text activity:", error);
    res.status(500).json({ error: "Failed to create text activity" });
  }
});

// DELETE /activities/text/:id - Delete a text attention activity
router.delete("/text/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = req.auth!.userId;

    const existing = await prisma.textAttention.findUnique({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Text activity not found" });
      return;
    }

    await prisma.textAttention.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting text activity:", error);
    res.status(500).json({ error: "Failed to delete text activity" });
  }
});

// =============================================================================
// IMAGE ATTENTION ROUTES
// =============================================================================

interface CreateImageAttentionBody {
  url: string;   // URL of the page
  src: string;   // URL to the image
  alt: string;
  title: string;
  width: number;
  caption: string;
}

// GET /activities/image - List all image attention activities
router.get("/image", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const activities = await prisma.imageAttention.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
    });
    res.json(activities);
  } catch (error) {
    console.error("Error fetching image activities:", error);
    res.status(500).json({ error: "Failed to fetch image activities" });
  }
});

// GET /activities/image/:id - Get a single image attention activity
router.get("/image/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = req.auth!.userId;
    const activity = await prisma.imageAttention.findUnique({
      where: { id, userId },
    });

    if (!activity) {
      res.status(404).json({ error: "Image activity not found" });
      return;
    }

    res.json(activity);
  } catch (error) {
    console.error("Error fetching image activity:", error);
    res.status(500).json({ error: "Failed to fetch image activity" });
  }
});

// POST /activities/image - Create a new image attention activity
router.post("/image", async (req: AuthRequest<{}, {}, CreateImageAttentionBody>, res: Response) => {
  try {
    const { url, src, alt, title, width, caption } = req.body;
    const userId = req.auth!.userId;

    if (!url || !src || !title || !caption) {
      res.status(400).json({ error: "url, src, title, and caption are required" });
      return;
    }

    await ensureUser(userId);

    const activity = await prisma.imageAttention.create({
      data: { url, src, alt, title, width, caption, userId },
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error("Error creating image activity:", error);
    res.status(500).json({ error: "Failed to create image activity" });
  }
});

// DELETE /activities/image/:id - Delete an image attention activity
router.delete("/image/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = req.auth!.userId;

    const existing = await prisma.imageAttention.findUnique({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Image activity not found" });
      return;
    }

    await prisma.imageAttention.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting image activity:", error);
    res.status(500).json({ error: "Failed to delete image activity" });
  }
});

// =============================================================================
// YOUTUBE ATTENTION ROUTES
// =============================================================================

interface CreateYoutubeAttentionBody {
  videoId: string;  // YouTube video ID
  title: string;
  channelName: string;
  caption?: string;
  activeWatchTime?: number;
}

// GET /activities/youtube - List all YouTube attention activities
router.get("/youtube", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const activities = await prisma.youtubeAttention.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
    });
    res.json(activities);
  } catch (error) {
    console.error("Error fetching YouTube activities:", error);
    res.status(500).json({ error: "Failed to fetch YouTube activities" });
  }
});

// GET /activities/youtube/:id - Get a single YouTube attention activity
router.get("/youtube/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.auth!.userId;
    const activity = await prisma.youtubeAttention.findUnique({
      where: { id, userId },
    });

    if (!activity) {
      res.status(404).json({ error: "YouTube activity not found" });
      return;
    }

    res.json(activity);
  } catch (error) {
    console.error("Error fetching YouTube activity:", error);
    res.status(500).json({ error: "Failed to fetch YouTube activity" });
  }
});

// POST /activities/youtube - Create a new YouTube attention activity
router.post("/youtube", async (req: AuthRequest<{}, {}, CreateYoutubeAttentionBody>, res: Response) => {
  try {
    const { videoId, title, channelName, caption, activeWatchTime } = req.body;
    const userId = req.auth!.userId;

    if (!videoId || !title || !channelName) {
      res.status(400).json({ error: "videoId, title, and channelName are required" });
      return;
    }

    await ensureUser(userId);

    const activity = await prisma.youtubeAttention.create({
      data: { videoId, title, channelName, caption, activeWatchTime, userId },
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error("Error creating YouTube activity:", error);
    res.status(500).json({ error: "Failed to create YouTube activity" });
  }
});

// DELETE /activities/youtube/:id - Delete a YouTube attention activity
router.delete("/youtube/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.auth!.userId;

    const existing = await prisma.youtubeAttention.findUnique({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "YouTube activity not found" });
      return;
    }

    await prisma.youtubeAttention.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting YouTube activity:", error);
    res.status(500).json({ error: "Failed to delete YouTube activity" });
  }
});

// =============================================================================
// AUDIO ATTENTION ROUTES
// =============================================================================

interface CreateAudioAttentionBody {
  url: string;    // URL of the page
  src: string;    // URL to the audio source
  title: string;
  duration: number;
  summary: string;
}

// GET /activities/audio - List all audio attention activities
router.get("/audio", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const activities = await prisma.audioAttention.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
    });
    res.json(activities);
  } catch (error) {
    console.error("Error fetching audio activities:", error);
    res.status(500).json({ error: "Failed to fetch audio activities" });
  }
});

// GET /activities/audio/:id - Get a single audio attention activity
router.get("/audio/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = req.auth!.userId;
    const activity = await prisma.audioAttention.findUnique({
      where: { id, userId },
    });

    if (!activity) {
      res.status(404).json({ error: "Audio activity not found" });
      return;
    }

    res.json(activity);
  } catch (error) {
    console.error("Error fetching audio activity:", error);
    res.status(500).json({ error: "Failed to fetch audio activity" });
  }
});

// POST /activities/audio - Create a new audio attention activity
router.post("/audio", async (req: AuthRequest<{}, {}, CreateAudioAttentionBody>, res: Response) => {
  try {
    const { url, src, title, duration, summary } = req.body;
    const userId = req.auth!.userId;

    if (!url || !src || !title || !summary) {
      res.status(400).json({ error: "url, src, title, and summary are required" });
      return;
    }

    await ensureUser(userId);

    const activity = await prisma.audioAttention.create({
      data: { url, src, title, duration, summary, userId },
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error("Error creating audio activity:", error);
    res.status(500).json({ error: "Failed to create audio activity" });
  }
});

// DELETE /activities/audio/:id - Delete an audio attention activity
router.delete("/audio/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = req.auth!.userId;

    const existing = await prisma.audioAttention.findUnique({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Audio activity not found" });
      return;
    }

    await prisma.audioAttention.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting audio activity:", error);
    res.status(500).json({ error: "Failed to delete audio activity" });
  }
});

export default router;
