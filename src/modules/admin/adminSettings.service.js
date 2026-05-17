import AppError from "../../utils/AppError.js";
import { AppSetting } from "../settings/appSetting.model.js";
import { Subject } from "../subject/subject.model.js";
import { Grade } from "../grade/grade.model.js";
import {
  getGeneralSettings as getSingletonGeneralSettings,
  updateGeneralSettings as updateSingletonGeneralSettings,
} from "../settings/generalSettings.service.js";
import { getThemeSettings as getSingletonThemeSettings } from "../settings/themeSettings.service.js";

const normalize = (v) => String(v || "").trim();

const ALLOWED_GROUPS = ["general", "theme", "security"];

const upsertGroupSettings = async ({ group, payload, actorId }) => {
  if (!ALLOWED_GROUPS.includes(group)) throw new AppError("Invalid settings group", 400);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("Payload must be an object", 400);
  }

  const entries = Object.entries(payload).filter(([k]) => normalize(k));
  if (!entries.length) throw new AppError("No settings provided", 400);

  await Promise.all(
    entries.map(([key, value]) =>
      AppSetting.findOneAndUpdate(
        { key: normalize(key) },
        {
          $set: {
            key: normalize(key),
            value,
            group,
            updatedBy: actorId || null,
          },
          $setOnInsert: {
            description: "",
          },
        },
        { new: true, upsert: true }
      )
    )
  );

  return getAdminSettings();
};

export const getAdminSettings = async () => {
  const [general, theme, rows] = await Promise.all([
    getSingletonGeneralSettings(),
    getSingletonThemeSettings(),
    AppSetting.find({ group: { $in: ["security"] } }).sort({ group: 1, key: 1 }).lean(),
  ]);
  const grouped = {
    general,
    theme,
    security: {},
    other: {},
  };

  for (const row of rows) {
    const group = ALLOWED_GROUPS.includes(row.group) ? row.group : "other";
    grouped[group][row.key] = row.value;
  }

  return grouped;
};

export const updateGeneralSettings = async ({ payload, actorId }) =>
  updateSingletonGeneralSettings({ payload, actorId });

export const updateSecuritySettings = async ({ payload, actorId }) =>
  upsertGroupSettings({ group: "security", payload, actorId });

export const getSettingsSubjectsGrades = async () => {
  const [subjects, grades] = await Promise.all([
    Subject.find().sort({ name: 1 }).lean(),
    Grade.find().sort({ order: 1, label: 1 }).lean(),
  ]);

  return { subjects, grades };
};
