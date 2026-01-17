import { Router } from "express";
import activitiesRouter from "./activities";

const router = Router();

router.use("/activities", activitiesRouter);

export default router;
