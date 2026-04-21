import mongoose from "mongoose";
import { Grade } from "../modules/grade/grade.model.js";
import { Subject } from "../modules/subject/subject.model.js";
import AppError from "./AppError.js";

const toStr = (v) => String(v || "").trim();
const toArray = (v) => (Array.isArray(v) ? v : []);

const uniqByKey = (items, getKey) => {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const findGradeById = async (gradeId) => {
  const id = toStr(gradeId);
  if (!id) return null;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid gradeId", 400);
  const grade = await Grade.findById(id).lean();
  if (!grade) throw new AppError("gradeId not found", 400);
  return grade;
};

const findSubjectById = async (subjectId) => {
  const id = toStr(subjectId);
  if (!id) return null;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid subjectId", 400);
  const subject = await Subject.findById(id).lean();
  if (!subject) throw new AppError("subjectId not found", 400);
  return subject;
};

export const resolveGradeRef = async ({ gradeId, gradeLevel, required = false } = {}) => {
  const id = toStr(gradeId);
  const labelInput = toStr(gradeLevel);

  if (!id && !labelInput) {
    if (required) throw new AppError("Grade is required", 400);
    return { gradeId: null, gradeLevel: "" };
  }

  const gradeById = await findGradeById(id);
  if (gradeById) {
    if (labelInput && labelInput !== gradeById.label) {
      throw new AppError("gradeId and gradeLevel mismatch", 400);
    }
    return { gradeId: gradeById._id, gradeLevel: gradeById.label };
  }

  if (!labelInput) {
    if (required) throw new AppError("Grade is required", 400);
    return { gradeId: null, gradeLevel: "" };
  }

  const gradeByLabel = await Grade.findOne({ label: labelInput }).lean();
  return {
    gradeId: gradeByLabel?._id || null,
    gradeLevel: labelInput,
  };
};

export const resolveSubjectRef = async ({ subjectId, subject, required = false } = {}) => {
  const id = toStr(subjectId);
  const nameInput = toStr(subject);

  if (!id && !nameInput) {
    if (required) throw new AppError("Subject is required", 400);
    return { subjectId: null, subject: "" };
  }

  const subjectById = await findSubjectById(id);
  if (subjectById) {
    if (nameInput && nameInput !== subjectById.name) {
      throw new AppError("subjectId and subject mismatch", 400);
    }
    return { subjectId: subjectById._id, subject: subjectById.name };
  }

  if (!nameInput) {
    if (required) throw new AppError("Subject is required", 400);
    return { subjectId: null, subject: "" };
  }

  const subjectByName = await Subject.findOne({ name: nameInput }).lean();
  return {
    subjectId: subjectByName?._id || null,
    subject: nameInput,
  };
};

export const resolveGradeRefs = async ({ gradeIds, gradeLevels } = {}) => {
  const idList = toArray(gradeIds).map((v) => toStr(v)).filter(Boolean);
  const labelList = toArray(gradeLevels).map((v) => toStr(v)).filter(Boolean);

  const fromIds = [];
  for (const id of idList) {
    const grade = await findGradeById(id);
    fromIds.push({ gradeId: grade._id, gradeLevel: grade.label });
  }

  const fromLabels = [];
  for (const label of labelList) {
    const grade = await Grade.findOne({ label }).lean();
    fromLabels.push({ gradeId: grade?._id || null, gradeLevel: label });
  }

  const merged = uniqByKey([...fromIds, ...fromLabels], (x) => x.gradeLevel || String(x.gradeId || ""));
  return {
    assignedGradeIds: merged.map((x) => x.gradeId).filter(Boolean),
    assignedGrades: merged.map((x) => x.gradeLevel).filter(Boolean),
  };
};

export const resolveSubjectRefs = async ({ subjectIds, subjects } = {}) => {
  const idList = toArray(subjectIds).map((v) => toStr(v)).filter(Boolean);
  const nameList = toArray(subjects).map((v) => toStr(v)).filter(Boolean);

  const fromIds = [];
  for (const id of idList) {
    const subject = await findSubjectById(id);
    fromIds.push({ subjectId: subject._id, subject: subject.name });
  }

  const fromNames = [];
  for (const name of nameList) {
    const subject = await Subject.findOne({ name }).lean();
    fromNames.push({ subjectId: subject?._id || null, subject: name });
  }

  const merged = uniqByKey([...fromIds, ...fromNames], (x) => x.subject || String(x.subjectId || ""));
  return {
    assignedSubjectIds: merged.map((x) => x.subjectId).filter(Boolean),
    assignedSubjects: merged.map((x) => x.subject).filter(Boolean),
  };
};
