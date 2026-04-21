import { Router } from "express";
import { getSmsStatistics } from "../otp/otp.controller.js";

const router = Router();

router.get("/statistics", getSmsStatistics);

export default router;

