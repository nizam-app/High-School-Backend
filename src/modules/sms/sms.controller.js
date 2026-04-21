import catchAsync from "../../utils/catchAsync.js";
import env from "../../config/env.js";
import { smsClient } from "../../config/smsClient.js";
import AppError from "../../utils/AppError.js";

const invalidInputMessage = "Json format input invalid!";

/**
 * POST /api/sendsms
 * Body: { phone: string (required), message: string }
 * 200 => { message: "SMS envoyé avec succès" }
 * 400 => { message: "Json format input invalid!" }
 */
export const sendSms = catchAsync(async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ message: invalidInputMessage });
  }
  const phone = body.phone != null ? String(body.phone).trim() : "";
  const message = body.message != null ? String(body.message) : "";
  if (!phone) {
    return res.status(400).json({ message: invalidInputMessage });
  }

  if (!env.SMS_AUTH_TOKEN) {
    throw new AppError("SMS provider is not configured. Set SMS_AUTH_TOKEN", 500);
  }

  try {
    await smsClient.post(env.SMS_SEND_PATH, { phone, message });
  } catch (err) {
    const providerMessage =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "SMS provider request failed";
    throw new AppError(providerMessage, 502);
  }

  return res.status(200).json({ message: "SMS envoyé avec succès" });
});
