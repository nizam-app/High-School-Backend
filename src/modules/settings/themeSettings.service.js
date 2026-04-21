import ThemeSettings from "./themeSettings.model.js";
import { cloneDefaultThemeSettings } from "./themeSettings.utils.js";
import { buildThemeResponse } from "./themeSettings.utils.js";

const SINGLETON_KEY = "school-theme-settings";

const mergeThemeUpdate = (existing, patch = {}) => {
  if (patch.mode !== undefined) existing.mode = patch.mode;
  if (patch.light !== undefined) existing.light = { ...existing.light.toObject(), ...patch.light };
  if (patch.dark !== undefined) existing.dark = { ...existing.dark.toObject(), ...patch.dark };
  if (patch.typography !== undefined) {
    existing.typography = { ...existing.typography.toObject(), ...patch.typography };
  }
  if (patch.components !== undefined) {
    existing.components = { ...existing.components.toObject(), ...patch.components };
  }
  if (patch.branding !== undefined) {
    existing.branding = { ...existing.branding.toObject(), ...patch.branding };
  }
};

export const ensureThemeSettings = async () => {
  const existing = await ThemeSettings.findOne({ singletonKey: SINGLETON_KEY });
  if (existing) return existing;

  return ThemeSettings.create({
    singletonKey: SINGLETON_KEY,
    ...cloneDefaultThemeSettings(),
  });
};

export const getThemeSettings = async () => {
  const settings = await ensureThemeSettings();
  return buildThemeResponse(settings);
};

export const updateThemeSettings = async ({ payload, actorId }) => {
  const settings = await ensureThemeSettings();
  mergeThemeUpdate(settings, payload);
  settings.updatedBy = actorId || null;
  await settings.save();
  return buildThemeResponse(settings);
};

export const replaceThemeSettings = async ({ payload, actorId }) => {
  const settings = await ensureThemeSettings();
  const defaults = cloneDefaultThemeSettings();

  settings.mode = payload.mode ?? defaults.mode;
  settings.light = payload.light ?? defaults.light;
  settings.dark = payload.dark ?? defaults.dark;
  settings.typography = payload.typography ?? defaults.typography;
  settings.components = payload.components ?? defaults.components;
  settings.branding = payload.branding ?? defaults.branding;
  settings.updatedBy = actorId || null;

  await settings.save();
  return buildThemeResponse(settings);
};

export const resetThemeSettings = async ({ actorId }) => {
  const settings = await ensureThemeSettings();
  const defaults = cloneDefaultThemeSettings();

  settings.mode = defaults.mode;
  settings.light = defaults.light;
  settings.dark = defaults.dark;
  settings.typography = defaults.typography;
  settings.components = defaults.components;
  settings.branding = defaults.branding;
  settings.updatedBy = actorId || null;

  await settings.save();
  return buildThemeResponse(settings);
};
