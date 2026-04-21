import mongoose from "mongoose";
import AppError from "../../utils/AppError.js";
import { Lesson } from "../lessons/lesson.model.js";
import User from "../user/user.model.js";

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listAdminLessons = async (query = {}) => {
  const page = toPositiveInt(query.page, 1);
  const limit = 5;
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.status && String(query.status).trim().toLowerCase() !== "all") {
    filter.status = String(query.status).trim().toLowerCase();
  }
  if (query.contentType && String(query.contentType).trim().toLowerCase() !== "all") {
    filter.contentType = String(query.contentType).trim().toLowerCase();
  }
  if (query.gradeId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.gradeId))) {
      throw new AppError("Invalid gradeId filter", 400);
    }
    filter.gradeId = query.gradeId;
  }
  if (query.subjectId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.subjectId))) {
      throw new AppError("Invalid subjectId filter", 400);
    }
    filter.subjectId = query.subjectId;
  }
  if (query.classId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.classId))) {
      throw new AppError("Invalid classId filter", 400);
    }
    filter.classId = query.classId;
  }

  if (query.createdBy) {
    const createdBy = String(query.createdBy).trim();
    if (!mongoose.Types.ObjectId.isValid(createdBy)) {
      throw new AppError("Invalid createdBy filter", 400);
    }
    filter.createdBy = createdBy;
  } else if (query.teacherId) {
    const teacherId = String(query.teacherId).trim();
    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
      throw new AppError("Invalid teacherId filter", 400);
    }
    filter.createdBy = teacherId;
  }

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ title: rx }, { chapter: rx }, { description: rx }];
  }

  const [total, rows] = await Promise.all([
    Lesson.countDocuments(filter),
    Lesson.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("gradeId", "_id label")
      .populate("subjectId", "_id name")
      .populate("classId", "_id gradeLevel subject")
      .populate("createdBy", "_id name role")
      .lean(),
  ]);

  return {
    data: rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const getAdminLessonById = async (lessonId) => {
  if (!mongoose.Types.ObjectId.isValid(String(lessonId))) {
    throw new AppError("Invalid lesson id", 400);
  }

  const lesson = await Lesson.findById(lessonId)
    .populate("gradeId", "_id label")
    .populate("subjectId", "_id name")
    .populate("classId", "_id gradeLevel subject")
    .populate("createdBy", "_id name role")
    .lean();

  if (!lesson) throw new AppError("Lesson not found", 404);
  return lesson;
};

export const updateAdminLesson = async ({ lessonId, payload = {} }) => {
  if (!mongoose.Types.ObjectId.isValid(String(lessonId))) {
    throw new AppError("Invalid lesson id", 400);
  }

  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw new AppError("Lesson not found", 404);

  if (payload.title !== undefined) {
    const title = String(payload.title).trim();
    if (!title) throw new AppError("title cannot be empty", 400);
    lesson.title = title;
  }
  if (payload.description !== undefined) lesson.description = String(payload.description || "").trim();
  if (payload.chapter !== undefined) {
    const chapter = String(payload.chapter).trim();
    if (!chapter) throw new AppError("chapter cannot be empty", 400);
    lesson.chapter = chapter;
  }
  if (payload.status !== undefined) {
    const status = String(payload.status).trim().toLowerCase();
    if (!["draft", "published"].includes(status)) {
      throw new AppError("Invalid status. Use draft/published", 400);
    }
    lesson.status = status;
  }
  if (payload.date !== undefined) {
    if (!payload.date) {
      lesson.date = undefined;
    } else {
      const d = new Date(payload.date);
      if (Number.isNaN(d.getTime())) throw new AppError("Invalid date", 400);
      lesson.date = d;
    }
  }

  await lesson.save();
  return getAdminLessonById(lesson._id);
};

export const deleteAdminLesson = async (lessonId) => {
  if (!mongoose.Types.ObjectId.isValid(String(lessonId))) {
    throw new AppError("Invalid lesson id", 400);
  }

  const lesson = await Lesson.findByIdAndDelete(lessonId);
  if (!lesson) throw new AppError("Lesson not found", 404);
  return { deleted: true, lessonId: lesson._id };
};

export const getAdminLessonsMeta = async () => {
  const teachers = await User.find({ role: "teacher", status: "active" })
    .select("_id name subject assignedGrades")
    .sort({ name: 1 })
    .lean();

  return { teachers };
};
