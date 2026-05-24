import mongoose from "mongoose";
import Grade from "./grade.model.js";
import User from "../user/user.model.js";
import ClassModel from "../class/class.model.js";
import Session from "../session/session.model.js";
import TimetableSlot from "../timetable/timetableSlot.model.js";
import AppError from "../../utils/AppError.js";

const normalizeStr = (v) => String(v || "").trim();

const normalizeSections = (sections) => {
  if (sections === undefined) return undefined;
  if (!Array.isArray(sections)) throw new AppError("sections must be an array", 400);
  return Array.from(new Set(sections.map((s) => normalizeStr(s)).filter(Boolean)));
};

const syncGradeLabelReferences = async ({ gradeId, oldLabel, newLabel }) => {
  if (!oldLabel || !newLabel || oldLabel === newLabel) return;

  await Promise.all([
    User.updateMany({ gradeLevel: oldLabel }, { $set: { gradeLevel: newLabel } }),
    User.updateMany({ gradeId }, { $set: { gradeLevel: newLabel } }),
    ClassModel.updateMany({ gradeLevel: oldLabel }, { $set: { gradeLevel: newLabel } }),
    ClassModel.updateMany({ gradeId }, { $set: { gradeLevel: newLabel } }),
    Session.updateMany({ grade: oldLabel }, { $set: { grade: newLabel } }),
    Session.updateMany({ gradeId }, { $set: { grade: newLabel } }),
    TimetableSlot.updateMany({ grade: oldLabel }, { $set: { grade: newLabel } }),
  ]);

  const teachers = await User.find({ assignedGrades: oldLabel }).select("assignedGrades");
  await Promise.all(
    teachers.map(async (teacher) => {
      teacher.assignedGrades = (teacher.assignedGrades || []).map((g) =>
        g === oldLabel ? newLabel : g
      );
      await teacher.save();
    })
  );
};

const assertGradeCanBeDeleted = async (grade) => {
  const gradeId = grade._id;
  const label = grade.label;
  const activeClassCount = await ClassModel.countDocuments({
    status: "active",
    $or: [{ gradeId }, { gradeLevel: label }],
  });

  if (activeClassCount > 0) {
    throw new AppError(
      `This grade has ${activeClassCount} active class(es). Delete or archive those classes first.`,
      400
    );
  }
};

export const createGrade = async (payload = {}, actorId = null) => {
  const label = normalizeStr(payload.label);

  if (!label) throw new AppError("Grade label is required", 400);

  const existsByLabel = await Grade.findOne({ label });
  if (existsByLabel) throw new AppError("Grade label already exists", 409);

  const sections = normalizeSections(payload.sections) ?? [];

  return Grade.create({
    label,
    order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : 0,
    sections,
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
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

  return Grade.find(filter).sort({ order: 1, label: 1 });
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

  const previousLabel = grade.label;

  if (payload.label !== undefined) {
    const label = normalizeStr(payload.label);
    if (!label) throw new AppError("Grade label cannot be empty", 400);
    if (label !== grade.label) {
      const existsByLabel = await Grade.findOne({ label });
      if (existsByLabel) throw new AppError("Grade label already exists", 409);
    }
    grade.label = label;
  }

  if (payload.order !== undefined) {
    const order = Number(payload.order);
    if (!Number.isFinite(order)) throw new AppError("order must be a number", 400);
    grade.order = order;
  }

  if (payload.sections !== undefined) {
    grade.sections = normalizeSections(payload.sections);
  }

  if (payload.isActive !== undefined) grade.isActive = Boolean(payload.isActive);

  grade.updatedBy = actorId;
  await grade.save();

  if (grade.label !== previousLabel) {
    await syncGradeLabelReferences({
      gradeId: grade._id,
      oldLabel: previousLabel,
      newLabel: grade.label,
    });
  }

  return grade;
};

export const deleteGrade = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid grade id", 400);

  const grade = await Grade.findById(id);
  if (!grade) throw new AppError("Grade not found", 404);

  await assertGradeCanBeDeleted(grade);

  await Grade.findByIdAndDelete(id);
  return grade;
};
