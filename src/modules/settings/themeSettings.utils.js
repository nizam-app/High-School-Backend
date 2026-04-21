import AppError from "../../utils/AppError.js";
import {
  DEFAULT_THEME_SETTINGS,
  THEME_COLOR_FIELDS,
  THEME_MODES,
} from "./themeSettings.constants.js";

const HEX_COLOR_REGEX = /^#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

const normalize = (value) => String(value || "").trim();

export const cloneDefaultThemeSettings = () =>
  JSON.parse(JSON.stringify(DEFAULT_THEME_SETTINGS));

export const assertAllowedKeys = (payload, allowedKeys, sectionName) => {
  const invalidKeys = Object.keys(payload || {}).filter((key) => !allowedKeys.includes(key));
  if (invalidKeys.length) {
    throw new AppError(
      `Invalid ${sectionName} field(s): ${invalidKeys.join(", ")}`,
      400
    );
  }
};

export const validateMode = (mode) => {
  const value = normalize(mode).toLowerCase();
  if (!THEME_MODES.includes(value)) {
    throw new AppError(`mode must be one of: ${THEME_MODES.join(", ")}`, 400);
  }
  return value;
};

export const validateHexColor = (value, fieldName) => {
  const color = normalize(value);
  if (!HEX_COLOR_REGEX.test(color)) {
    throw new AppError(`${fieldName} must be a valid hex color`, 400);
  }
  return color.toUpperCase();
};

export const validateThemeColorsSection = (payload = {}, sectionName) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError(`${sectionName} must be an object`, 400);
  }
  assertAllowedKeys(payload, THEME_COLOR_FIELDS, sectionName);

  const normalized = {};
  for (const field of Object.keys(payload)) {
    normalized[field] = validateHexColor(payload[field], `${sectionName}.${field}`);
  }
  return normalized;
};

export const validateTypographySection = (payload = {}) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("typography must be an object", 400);
  }

  assertAllowedKeys(payload, ["fontFamily", "baseFontSize", "headingScale", "lineHeight"], "typography");

  const normalized = {};

  if (payload.fontFamily !== undefined) {
    const fontFamily = normalize(payload.fontFamily);
    if (!fontFamily) throw new AppError("typography.fontFamily is required", 400);
    if (fontFamily.length > 120) throw new AppError("typography.fontFamily is too long", 400);
    normalized.fontFamily = fontFamily;
  }

  if (payload.baseFontSize !== undefined) {
    const value = Number(payload.baseFontSize);
    if (!Number.isFinite(value) || value < 12 || value > 24) {
      throw new AppError("typography.baseFontSize must be between 12 and 24", 400);
    }
    normalized.baseFontSize = value;
  }

  if (payload.headingScale !== undefined) {
    const value = Number(payload.headingScale);
    if (!Number.isFinite(value) || value < 1 || value > 2) {
      throw new AppError("typography.headingScale must be between 1 and 2", 400);
    }
    normalized.headingScale = value;
  }

  if (payload.lineHeight !== undefined) {
    const value = Number(payload.lineHeight);
    if (!Number.isFinite(value) || value < 1 || value > 2.4) {
      throw new AppError("typography.lineHeight must be between 1 and 2.4", 400);
    }
    normalized.lineHeight = value;
  }

  return normalized;
};

export const validateFullThemePayload = (payload = {}) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("Payload must be an object", 400);
  }

  assertAllowedKeys(
    payload,
    ["mode", "light", "dark", "typography"],
    "theme"
  );

  return {
    mode: payload.mode !== undefined ? validateMode(payload.mode) : undefined,
    light: payload.light !== undefined ? validateThemeColorsSection(payload.light, "light") : undefined,
    dark: payload.dark !== undefined ? validateThemeColorsSection(payload.dark, "dark") : undefined,
    typography:
      payload.typography !== undefined ? validateTypographySection(payload.typography) : undefined,
  };
};

export const buildThemeResponse = (doc) => ({
  id: doc._id,
  mode: doc.mode,
  light: doc.light,
  dark: doc.dark,
  typography: doc.typography,
  updatedAt: doc.updatedAt,
});
