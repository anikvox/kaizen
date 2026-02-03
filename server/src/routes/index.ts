import { Router } from "express";
import activitiesRouter from "./activities";
import focusRouter from "./focus";
import deviceTokensRouter from "./device-tokens";
import chatRouter from "./chat";
import aiRouter from "./ai";
import settingsRouter from "./settings";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Device tokens routes (has its own auth handling - some routes are public)
router.use("/device-tokens", deviceTokensRouter);

// Chat routes (has its own device token auth)
router.use("/chat", chatRouter);

// AI routes (requires auth)
router.use("/ai", aiRouter);

// Apply auth middleware to all routes except health
router.use("/activities", requireAuth, activitiesRouter);
router.use("/focus", requireAuth, focusRouter);
router.use("/settings", requireAuth, settingsRouter);

export default router;
