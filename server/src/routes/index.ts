import { Router } from "express";
import activitiesRouter from "./activities";
import focusRouter from "./focus";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Apply auth middleware to all routes except health
router.use("/activities", requireAuth, activitiesRouter);
router.use("/focus", requireAuth, focusRouter);

export default router;
