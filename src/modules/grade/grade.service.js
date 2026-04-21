import mongoose from "mongoose";
import Grade from "./grade.model.js";
import AppError from "../../utils/AppError.js";

const normalizeStr = (v) => String(v || "").trim();

export const createGrade = async (payload = {}, actorId = null) => {
  const label = normalizeStr(payload.label);

  if (!label) throw new AppError("Grade label is required", 400);

  const existsByLabel = await Grade.findOne({ label });
  if (existsByLabel) throw new AppError("Grade label already exists", 409);

  return Grade.create({
    label,
    createdBy: actorId,
    updatedBy: actorId,
  });
};

export const listGrades = async (query = {}) => {
  const filter = {};

  if (query.isActive !== undefined) {
    const v = String(query.isActive).trim().toLowerCase();
    filter.isActive = ["true", "1", "yes"].includes(v);
  }

  return Grade.find(filter).sort({ label: 1 });
};

export const getGradeById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid grade id", 400);

  const grade = await Grade.findById(id);
  if (!grade) throw new AppError("Grade not found", 404);
  return grade;
};

export const updateGrade = async (id, payload = {}, actorId = null) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid grade id", 400);

  const grade = await Grade.findById(id);
  if (!grade) throw new AppError("Grade not found", 404);

  if (payload.label !== undefined) {
    const label = normalizeStr(payload.label);
    if (!label) throw new AppError("Grade label cannot be empty", 400);
    if (label !== grade.label) {
      const existsByLabel = await Grade.findOne({ label });
      if (existsByLabel) throw new AppError("Grade label already exists", 409);
    }
    grade.label = label;
  }

  if (payload.isActive !== undefined) grade.isActive = Boolean(payload.isActive);

  grade.updatedBy = actorId;
  await grade.save();
  return grade;
};

export const deleteGrade = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid grade id", 400);

  const grade = await Grade.findByIdAndDelete(id);
  if (!grade) throw new AppError("Grade not found", 404);
  return grade;
};
