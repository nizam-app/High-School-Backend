import mongoose from "mongoose";
import Subject from "./subject.model.js";
import AppError from "../../utils/AppError.js";

const normalizeStr = (v) => String(v || "").trim();

export const createSubject = async (payload = {}, actorId = null) => {
  const name = normalizeStr(payload.name);
  const code = normalizeStr(payload.code).toUpperCase();
  const description = normalizeStr(payload.description);
  const color = normalizeStr(payload.color) || "#1f3c88";

  if (!name) throw new AppError("Subject name is required", 400);

  const existsByName = await Subject.findOne({ name });
  if (existsByName) throw new AppError("Subject name already exists", 409);

  if (code) {
    const existsByCode = await Subject.findOne({ code });
    if (existsByCode) throw new AppError("Subject code already exists", 409);
  }

  const subject = await Subject.create({
    name,
    code: code || undefined,
    description,
    color,
    createdBy: actorId,
    updatedBy: actorId,
  });

  return subject;
};

export const listSubjects = async (query = {}) => {
  const filter = {};

  if (query.isActive !== undefined) {
    const v = String(query.isActive).trim().toLowerCase();
    filter.isActive = ["true", "1", "yes"].includes(v);
  }

  if (query.search) {
    const q = normalizeStr(query.search);
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { code: { $regex: q, $options: "i" } },
    ];
  }

  return Subject.find(filter).sort({ name: 1 });
};

export const listAllSubjectsBasic = async () => {
  const subjects = await Subject.find({})
    .select("_id name")
    .sort({ name: 1 })
    .lean();

  return subjects.map((subject) => ({
    id: subject._id,
    name: subject.name,
  }));
};

export const getSubjectById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid subject id", 400);

  const subject = await Subject.findById(id);
  if (!subject) throw new AppError("Subject not found", 404);
  return subject;
};

export const updateSubject = async (id, payload = {}, actorId = null) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid subject id", 400);

  const subject = await Subject.findById(id);
  if (!subject) throw new AppError("Subject not found", 404);

  if (payload.name !== undefined) {
    const name = normalizeStr(payload.name);
    if (!name) throw new AppError("Subject name cannot be empty", 400);
    if (name !== subject.name) {
      const existsByName = await Subject.findOne({ name });
      if (existsByName) throw new AppError("Subject name already exists", 409);
    }
    subject.name = name;
  }

  if (payload.code !== undefined) {
    const code = normalizeStr(payload.code).toUpperCase();
    if (!code) {
      subject.code = undefined;
    } else {
      if (code !== subject.code) {
        const existsByCode = await Subject.findOne({ code });
        if (existsByCode) throw new AppError("Subject code already exists", 409);
      }
      subject.code = code;
    }
  }

  if (payload.description !== undefined) subject.description = normalizeStr(payload.description);
  if (payload.color !== undefined) subject.color = normalizeStr(payload.color);
  if (payload.isActive !== undefined) subject.isActive = Boolean(payload.isActive);

  subject.updatedBy = actorId;
  await subject.save();
  return subject;
};

export const deleteSubject = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid subject id", 400);

  const subject = await Subject.findByIdAndDelete(id);
  if (!subject) throw new AppError("Subject not found", 404);
  return subject;
};
