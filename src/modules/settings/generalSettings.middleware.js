import AppError from "../../utils/AppError.js";
import { validateAndNormalizeGeneralSettingsPayload } from "./generalSettings.validation.js";

export const allowGeneralSettingsWrite = (req, res, next) => {
  const role = String(req.user?.role || "").trim().toLowerCase();
  if (!["admin", "super_admin", "superadmin"].includes(role)) {
    return next(new AppError("Forbidden", 403));
  }
  return next();
};

export const validateGeneralSettingsRequest = (req, res, next) => {
  try {
    req.validatedGeneralSettings =
      validateAndNormalizeGeneralSettingsPayload(req.body || {});
    return next();
  } catch (error) {
    return next(error);
  }
};
