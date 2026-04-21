import mongoose from "mongoose";
import AppError from "../../utils/AppError.js";
import Grade from "../grade/grade.model.js";
import Subject from "../subject/subject.model.js";
import { Lesson } from "./lesson.model.js";
import User from "../user/user.model.js";
import ClassModel from "../class/class.model.js";
import { buildStoredFileMetaList } from "../../utils/fileStorage.js";

const normKey = (k) => String(k || "").trim().toLowerCase();
const readField = (payload, ...aliases) => {
  const p = payload || {};
  for (const [k, v] of Object.entries(p)) {
    const nk = normKey(k);
    if (aliases.some((a) => nk === normKey(a))) return v;
  }
  return undefined;
};

const toObjectId = (value, fieldName) => {
  const raw = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new AppError(`${fieldName} is invalid`, 400);
  }
  return raw;
};

const resolveScope = async ({ gradeId, subjectId }) => {
  const [grade, subject] = await Promise.all([
    Grade.findById(gradeId).lean(),
    Subject.findById(subjectId).lean(),
  ]);

  if (!grade) throw new AppError("Grade not found", 404);
  if (!subject) throw new AppError("Subject not found", 404);
  if (grade.isActive === false) throw new AppError("Grade is inactive", 400);
  if (subject.isActive === false) throw new AppError("Subject is inactive", 400);

  return { grade, subject };
};

const ensureTeacherScopeAccess = ({ user, gradeLabel, subjectName }) => {
  if (String(user.subject || "").trim() !== String(subjectName || "").trim()) {
    throw new AppError(`You can only create lessons for your subject "${user.subject}"`, 403);
  }

  const grades = Array.isArray(user.assignedGrades) ? user.assignedGrades : [];
  if (!grades.includes(String(gradeLabel || "").trim())) {
    throw new AppError(`You are not assigned to grade "${gradeLabel}"`, 403);
  }
};

const resolveClassForScope = async ({ teacherId, gradeId, subjectId }) => {
  if (!teacherId) return null;
  return ClassModel.findOne({
    teacher: teacherId,
    gradeId,
    subjectId,
    status: "active",
  })
    .select("_id teacher gradeLevel gradeId subject subjectId")
    .lean();
};

export const createLessonFromForm = async ({ user, payload, files }) => {
  const title = String(readField(payload, "title", "lessonTitle") || "").trim();
  const description = String(readField(payload, "description") || "").trim();
  const contentType = String(readField(payload, "contentType") || "").trim().toLowerCase();
  const chapter = String(readField(payload, "chapter") || "").trim();
  const status = String(readField(payload, "status") || "published").trim().toLowerCase();
  const gradeId = toObjectId(readField(payload, "gradeId"), "gradeId");
  const subjectId = toObjectId(readField(payload, "subjectId"), "subjectId");

  const dateInput = readField(payload, "date", "lessonDate");
  const lessonDate = dateInput ? new Date(dateInput) : null;

  if (!title) throw new AppError("Lesson title is required", 400);
  if (!["text", "pdf", "video", "image", "quiz"].includes(contentType)) {
    throw new AppError("Invalid contentType. Use text/pdf/video/image/quiz", 400);
  }
  if (!chapter) throw new AppError("Chapter is required", 400);
  if (!["draft", "published"].includes(status)) throw new AppError("Invalid status. Use draft/published", 400);
  if (dateInput && Number.isNaN(lessonDate?.getTime())) throw new AppError("Invalid date", 400);

  if (["pdf", "video", "image"].includes(contentType) && (!files || files.length === 0)) {
    throw new AppError("For file-based lessons, at least 1 file attachment is required.", 400);
  }

  const { grade, subject } = await resolveScope({ gradeId, subjectId });

  if (user.role === "teacher") {
    ensureTeacherScopeAccess({
      user,
      gradeLabel: grade.label,
      subjectName: subject.name,
    });
  }

  let effectiveTeacherId = user.role === "teacher" ? user._id : null;
  const teacherIdInput = readField(payload, "teacherId");
  if (user.role === "admin" && teacherIdInput) {
    const teacherId = toObjectId(teacherIdInput, "teacherId");
    const teacher = await User.findById(teacherId).lean();

    if (!teacher || teacher.role !== "teacher") {
      throw new AppError("Invalid teacherId", 400);
    }

    if (String(teacher.subject || "").trim() !== String(subject.name || "").trim()) {
      throw new AppError(`Teacher subject is "${teacher.subject}", not "${subject.name}"`, 400);
    }

    const grades = Array.isArray(teacher.assignedGrades) ? teacher.assignedGrades : [];
    if (!grades.includes(String(grade.label || "").trim())) {
      throw new AppError(`Teacher is not assigned to grade "${grade.label}"`, 400);
    }
    effectiveTeacherId = teacherId;
  }

  const explicitClassId = readField(payload, "classId");
  let classDoc = null;
  if (explicitClassId && mongoose.Types.ObjectId.isValid(String(explicitClassId))) {
    classDoc = await ClassModel.findById(explicitClassId)
      .select("_id teacher gradeLevel gradeId subject subjectId status")
      .lean();
    if (classDoc) {
      if (effectiveTeacherId && String(classDoc.teacher) !== String(effectiveTeacherId)) {
        throw new AppError("Selected class does not belong to selected teacher", 400);
      }
      if (String(classDoc.gradeId || "") !== String(gradeId) || String(classDoc.subjectId || "") !== String(subjectId)) {
        throw new AppError("Selected class does not match grade/subject", 400);
      }
    }
  }
  if (!classDoc) {
    classDoc = await resolveClassForScope({
      teacherId: effectiveTeacherId,
      gradeId,
      subjectId,
    });
  }

  const attachments = buildStoredFileMetaList(files, "lessons");

  const lesson = await Lesson.create({
    classId: classDoc?._id || null,
    gradeId,
    subjectId,
    createdBy: user._id,
    title,
    description,
    contentType,
    chapter,
    date: lessonDate || undefined,
    files: attachments,
    status,
  });

  return lesson;
};

export const updateLessonById = async ({ user, lessonId, payload, files }) => {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw new AppError("Lesson not found", 404);

  if (user.role === "teacher" && String(lesson.createdBy) !== String(user._id)) {
    throw new AppError("You can only edit your own lessons", 403);
  }

  const [grade, subject] = await Promise.all([
    Grade.findById(lesson.gradeId).lean(),
    Subject.findById(lesson.subjectId).lean(),
  ]);

  if (!grade || !subject) {
    throw new AppError("Lesson scope references invalid grade/subject", 400);
  }

  if (user.role === "teacher") {
    ensureTeacherScopeAccess({
      user,
      gradeLabel: grade.label,
      subjectName: subject.name,
    });
  }

  const nextTitle = readField(payload, "title", "lessonTitle");
  if (nextTitle !== undefined) {
    const t = String(nextTitle).trim();
    if (!t) throw new AppError("Lesson title cannot be empty", 400);
    lesson.title = t;
  }

  const nextDescription = readField(payload, "description");
  if (nextDescription !== undefined) {
    lesson.description = String(nextDescription).trim();
  }

  const nextChapter = readField(payload, "chapter");
  if (nextChapter !== undefined) {
    const c = String(nextChapter).trim();
    if (!c) throw new AppError("Chapter cannot be empty", 400);
    lesson.chapter = c;
  }

  const nextStatus = readField(payload, "status");
  if (nextStatus !== undefined) {
    const s = String(nextStatus).trim().toLowerCase();
    if (!["draft", "published"].includes(s)) throw new AppError("Invalid status. Use draft/published", 400);
    lesson.status = s;
  }

  const nextDateInput = readField(payload, "date", "lessonDate");
  if (nextDateInput) {
    const d = new Date(nextDateInput);
    if (Number.isNaN(d.getTime())) throw new AppError("Invalid date", 400);
    lesson.date = d;
  }

  const newAttachments = buildStoredFileMetaList(files, "lessons");

  if (newAttachments.length) {
    lesson.files = [...(lesson.files || []), ...newAttachments];
  }

  await lesson.save();
  return lesson;
};

export const deleteLessonById = async ({ user, lessonId }) => {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw new AppError("Lesson not found", 404);

  if (user.role === "teacher" && String(lesson.createdBy) !== String(user._id)) {
    throw new AppError("You can only delete your own lessons", 403);
  }

  await Lesson.findByIdAndDelete(lessonId);
  return { deleted: true };
};
