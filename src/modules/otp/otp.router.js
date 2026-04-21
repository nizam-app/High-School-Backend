import { Router } from "express";
import { resendOtp, sendOtp, verifyOtp } from "./otp.controller.js";

const router = Router();

router.post("/send", sendOtp);
router.post("/verify", verifyOtp);
router.post("/resend", resendOtp);

export default router;

