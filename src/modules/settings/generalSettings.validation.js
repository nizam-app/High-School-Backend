import AppError from "../../utils/AppError.js";
import { ALLOWED_GRADING_SYSTEMS, TIME_24H_REGEX } from "./generalSettings.model.js";

const normalize = (value) => String(value || "").trim();
const pickDefined = (...values) => values.find((value) => value !== undefined);

export const DEFAULT_GENERAL_SETTINGS = Object.freeze({
  academicYear: "2025-2026",
  gradingSystem: "percentage",
  defaultClassDuration: 45,
  schoolStartTime: "08:00",
});

export const validateAndNormalizeGeneralSettingsPayload = (payload = {}) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("Payload must be an object", 400);
  }

  const academicYear = normalize(payload.academicYear);
  if (!academicYear) {
    throw new AppError("academicYear is required", 400);
  }

  const gradingSystem = normalize(payload.gradingSystem).toLowerCase();
  if (!ALLOWED_GRADING_SYSTEMS.includes(gradingSystem)) {
    throw new AppError(
      `gradingSystem must be one of: ${ALLOWED_GRADING_SYSTEMS.join(", ")}`,
      400
    );
  }

  const defaultClassDurationRaw = pickDefined(
    payload.defaultClassDuration,
    payload.defaultClassDurationMinutes
  );
  const defaultClassDuration = Number(defaultClassDurationRaw);
  if (!Number.isFinite(defaultClassDuration) || defaultClassDuration <= 0) {
    throw new AppError(
      "defaultClassDuration/defaultClassDurationMinutes must be a positive number",
      400
    );
  }

  const schoolStartTime = normalize(payload.schoolStartTime);
  if (!TIME_24H_REGEX.test(schoolStartTime)) {
    throw new AppError("schoolStartTime must be a valid time in HH:MM format", 400);
  }

  return {
    academicYear,
    gradingSystem,
    defaultClassDuration,
    schoolStartTime,
  };
};
