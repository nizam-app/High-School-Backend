import { Router } from "express";
import { sendSms } from "./sms.controller.js";
import { getSmsStatistics } from "../otp/otp.controller.js";

/**
 * Router mounted at /api so that:
 *   POST /api/sendsms
 *   GET  /api/sms-statistics
 */
const router = Router();

router.post("/sendsms", sendSms);
router.get("/sms-statistics", getSmsStatistics);

export default router;
