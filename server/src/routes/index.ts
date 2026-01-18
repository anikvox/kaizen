import { Router } from "express";
import activitiesRouter from "./activities";
import focusRouter from "./focus";
import deviceTokensRouter from "./device-tokens";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Device tokens routes (has its own auth handling - some routes are public)
router.use("/device-tokens", deviceTokensRouter);

// Apply auth middleware to all routes except health
router.use("/activities", requireAuth, activitiesRouter);
router.use("/focus", requireAuth, focusRouter);

export default router;
