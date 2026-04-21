import jwt from "jsonwebtoken";
import env from "../config/env.js";
import AppError from "./AppError.js";

export const signTwoFactorTempToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      purpose: "2fa_login",
    },
    env.TWO_FACTOR_TEMP_TOKEN_SECRET,
    { expiresIn: env.TWO_FACTOR_TEMP_TOKEN_EXPIRES_IN || "5m" }
  );

export const verifyTwoFactorTempToken = (token) => {
  try {
    const payload = jwt.verify(token, env.TWO_FACTOR_TEMP_TOKEN_SECRET);
    if (payload?.purpose !== "2fa_login" || !payload?.sub) {
      throw new AppError("Invalid or expired tempAuthToken", 401);
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Invalid or expired tempAuthToken", 401);
  }
};
