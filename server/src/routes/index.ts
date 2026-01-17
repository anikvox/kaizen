import { Router } from "express";
import activitiesRouter from "./activities";
import focusRouter from "./focus";

const router = Router();

router.use("/activities", activitiesRouter);
router.use("/focus", focusRouter);

export default router;
