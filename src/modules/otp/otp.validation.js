import AppError from "../../utils/AppError.js";

const PHONE_REGEX = /^[234]\d{7}$/;

export const validatePhoneInput = (phone) => {
  const normalized = String(phone || "").trim();
  if (!normalized) throw new AppError("phone is required", 400);
  if (!PHONE_REGEX.test(normalized)) {
    throw new AppError("phone must be 8 digits and start with 2, 3, or 4", 400);
  }
  return normalized;
};

export const validateOtpInput = (otp, length = 4) => {
  const normalized = String(otp || "").trim();
  const re = new RegExp(`^\\d{${length}}$`);
  if (!re.test(normalized)) {
    throw new AppError(`otp must be exactly ${length} digits`, 400);
  }
  return normalized;
};

