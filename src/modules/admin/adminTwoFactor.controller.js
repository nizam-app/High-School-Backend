import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import {
  disableTwoFactor,
  regenerateTwoFactorBackupCodes,
  setupTwoFactor,
  verifyAndEnableTwoFactor,
  verifyTwoFactorLogin,
} from "./adminTwoFactor.service.js";

const getRequestContext = (req) => ({
  ip:
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "",
  userAgent: req.get("user-agent") || "",
});

export const setupAdminTwoFactor = catchAsync(async (req, res) => {
  const data = await setupTwoFactor({
    userId: req.user._id,
    context: getRequestContext(req),
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Two-factor setup data generated successfully",
    data,
  });
});

export const verifyAdminTwoFactorSetup = catchAsync(async (req, res) => {
  const data = await verifyAndEnableTwoFactor({
    userId: req.user._id,
    otp: req.body?.otp,
    context: getRequestContext(req),
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Two-factor authentication enabled successfully",
    data,
  });
});

export const verifyAdminTwoFactorLogin = catchAsync(async (req, res) => {
  const data = await verifyTwoFactorLogin({
    tempAuthToken: req.body?.tempAuthToken,
    otp: req.body?.otp,
    backupCode: req.body?.backupCode,
    context: getRequestContext(req),
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Two-factor authentication verified successfully",
    data,
  });
});

export const disableAdminTwoFactor = catchAsync(async (req, res) => {
  const data = await disableTwoFactor({
    userId: req.user._id,
    currentPassword: req.body?.currentPassword,
    currentPin: req.body?.currentPin,
    otp: req.body?.otp,
    backupCode: req.body?.backupCode,
    context: getRequestContext(req),
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Two-factor authentication disabled successfully",
    data,
  });
});

export const regenerateAdminBackupCodes = catchAsync(async (req, res) => {
  const data = await regenerateTwoFactorBackupCodes({
    userId: req.user._id,
    currentPassword: req.body?.currentPassword,
    currentPin: req.body?.currentPin,
    otp: req.body?.otp,
    backupCode: req.body?.backupCode,
    context: getRequestContext(req),
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Backup codes regenerated successfully",
    data,
  });
});
