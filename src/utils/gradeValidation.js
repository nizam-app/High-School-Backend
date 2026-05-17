import mongoose from "mongoose";
import { Grade } from "../modules/grade/grade.model.js";
import AppError from "./AppError.js";

const toStr = (v) => String(v || "").trim();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const GRADE_NOT_FOUND_MESSAGE = "Selected grade not found";

const findGradeDocumentById = async (gradeId, { requireActive = true } = {}) => {
  const id = toStr(gradeId);
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;

  const grade = await Grade.findById(id).lean();
  if (!grade) return null;
  if (requireActive && grade.isActive === false) {
    throw new AppError("Selected grade is inactive", 400);
  }
  return grade;
};

const findGradeDocumentByLabel = async (label, { requireActive = true } = {}) => {
  const normalized = toStr(label);
  if (!normalized) return null;

  const grade = await Grade.findOne({
    label: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
  }).lean();

  if (!grade) return null;
  if (requireActive && grade.isActive === false) {
    throw new AppError("Selected grade is inactive", 400);
  }
  return grade;
};

/**
 * Resolve a student's grade from gradeId (preferred) or grade/gradeLevel label.
 * Never validates against a hardcoded grade list.
 */
export const resolveStudentGradeFromPayload = async (payload = {}) => {
  const rawGradeId = payload.gradeId ?? payload.grade_id;
  const rawLabel = payload.gradeLevel ?? payload.grade_label ?? payload.grade;

  let gradeId = toStr(rawGradeId);

  if (gradeId && !mongoose.Types.ObjectId.isValid(gradeId)) {
    const byMislabeledId = await findGradeDocumentByLabel(gradeId);
    if (!byMislabeledId) throw new AppError(GRADE_NOT_FOUND_MESSAGE, 400);
    return { gradeId: byMislabeledId._id, gradeLevel: byMislabeledId.label };
  }

  if (gradeId) {
    const byId = await findGradeDocumentById(gradeId);
    if (!byId) throw new AppError(GRADE_NOT_FOUND_MESSAGE, 400);
    return { gradeId: byId._id, gradeLevel: byId.label };
  }

  const label = toStr(rawLabel);
  if (!label) throw new AppError("Grade is required", 400);

  const byLabel = await findGradeDocumentByLabel(label);
  if (!byLabel) throw new AppError(GRADE_NOT_FOUND_MESSAGE, 400);

  return { gradeId: byLabel._id, gradeLevel: byLabel.label };
};

/**
 * Validate each grade id in a list exists in the database.
 */
export const resolveTeacherGradesFromPayload = async (payload = {}) => {
  const idList = []
    .concat(payload.assignedGradeIds || [])
    .map((v) => toStr(v))
    .filter(Boolean);

  const labelList = (payload.assignedGrades || [])
    .map((v) => toStr(v))
    .filter(Boolean);

  const resolved = [];
  const seen = new Set();

  for (const id of idList) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError(GRADE_NOT_FOUND_MESSAGE, 400);
    }
    const grade = await findGradeDocumentById(id);
    if (!grade) throw new AppError(GRADE_NOT_FOUND_MESSAGE, 400);
    const key = String(grade._id);
    if (!seen.has(key)) {
      seen.add(key);
      resolved.push({ gradeId: grade._id, gradeLevel: grade.label });
    }
  }

  for (const label of labelList) {
    const grade = await findGradeDocumentByLabel(label);
    if (!grade) throw new AppError(GRADE_NOT_FOUND_MESSAGE, 400);
    const key = String(grade._id);
    if (!seen.has(key)) {
      seen.add(key);
      resolved.push({ gradeId: grade._id, gradeLevel: grade.label });
    }
  }

  return {
    assignedGradeIds: resolved.map((g) => g.gradeId),
    assignedGrades: resolved.map((g) => g.gradeLevel),
  };
};
