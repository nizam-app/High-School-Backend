import AppError from "../../utils/AppError.js";
import {
  validateFullThemePayload,
  validateMode,
  validateThemeColorsSection,
  validateTypographySection,
} from "./themeSettings.utils.js";

export const allowThemeSettingsWrite = (req, res, next) => {
  const role = String(req.user?.role || "").trim().toLowerCase();
  if (!["admin", "super_admin", "superadmin"].includes(role)) {
    return next(new AppError("Forbidden", 403));
  }
  return next();
};

const runValidation = (req, next, validator) => {
  try {
    req.validatedThemeSettings = validator(req.body || {});
    return next();
  } catch (error) {
    return next(error);
  }
};

export const validateFullThemeRequest = (req, res, next) =>
  runValidation(req, next, validateFullThemePayload);

export const validateThemeModeRequest = (req, res, next) =>
  runValidation(req, next, (payload) => ({ mode: validateMode(payload.mode) }));

export const validateThemeLightRequest = (req, res, next) =>
  runValidation(req, next, (payload) => ({ light: validateThemeColorsSection(payload, "light") }));

export const validateThemeDarkRequest = (req, res, next) =>
  runValidation(req, next, (payload) => ({ dark: validateThemeColorsSection(payload, "dark") }));

export const validateThemeTypographyRequest = (req, res, next) =>
  runValidation(req, next, (payload) => ({ typography: validateTypographySection(payload) }));
