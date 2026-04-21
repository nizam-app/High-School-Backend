import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import {
  getSmsStatisticsService,
  resendOtpService,
  sendOtpService,
  verifyOtpService,
} from "./otp.service.js";
import { validateOtpInput, validatePhoneInput } from "./otp.validation.js";
import env from "../../config/env.js";

export const sendOtp = catchAsync(async (req, res) => {
  const phone = validatePhoneInput(req.body?.phone);
  const data = await sendOtpService({ phone });
  return sendResponse(res, { statusCode: 200, message: "OTP sent successfully", data });
});

export const verifyOtp = catchAsync(async (req, res) => {
  const phone = validatePhoneInput(req.body?.phone);
  const otp = validateOtpInput(req.body?.otp, env.OTP_LENGTH);
  const data = await verifyOtpService({ phone, otp });
  return sendResponse(res, { statusCode: 200, message: "Phone verified", data });
});

export const resendOtp = catchAsync(async (req, res) => {
  const phone = validatePhoneInput(req.body?.phone);
  const data = await resendOtpService({ phone });
  return sendResponse(res, { statusCode: 200, message: "OTP resent successfully", data });
});

export const getSmsStatistics = catchAsync(async (req, res) => {
  const data = await getSmsStatisticsService();
  return sendResponse(res, { statusCode: 200, message: "SMS statistics fetched", data });
});

