import GeneralSettings from "./generalSettings.model.js";
import { DEFAULT_GENERAL_SETTINGS } from "./generalSettings.validation.js";

const SINGLETON_KEY = "school-general-settings";

const toGeneralSettingsResponse = (doc) => ({
  id: doc._id,
  academicYear: doc.academicYear,
  gradingSystem: doc.gradingSystem,
  defaultClassDuration: doc.defaultClassDuration,
  schoolStartTime: doc.schoolStartTime,
  updatedAt: doc.updatedAt,
});

export const ensureGeneralSettings = async () => {
  const existing = await GeneralSettings.findOne({ singletonKey: SINGLETON_KEY });
  if (existing) return existing;

  return GeneralSettings.create({
    singletonKey: SINGLETON_KEY,
    ...DEFAULT_GENERAL_SETTINGS,
  });
};

export const getGeneralSettings = async () => {
  const settings = await ensureGeneralSettings();
  return toGeneralSettingsResponse(settings);
};

export const updateGeneralSettings = async ({ payload, actorId }) => {
  const existing = await ensureGeneralSettings();

  existing.academicYear = payload.academicYear;
  existing.gradingSystem = payload.gradingSystem;
  existing.defaultClassDuration = payload.defaultClassDuration;
  existing.schoolStartTime = payload.schoolStartTime;
  existing.updatedBy = actorId || null;

  await existing.save();
  return toGeneralSettingsResponse(existing);
};
