// lesson.controller.js
import { catchAsync } from "../../utils/catchAsync.js";
import AppError from "../../utils/AppError.js";
import { Lesson } from "./lesson.model.js";
import * as lessonService from "./lesson.service.js";
import Grade from "../grade/grade.model.js";
import Subject from "../subject/subject.model.js";
import mongoose from "mongoose";

const norm = (v) => String(v || "").trim().toLowerCase();
const toObjectId = (value, fieldName) => {
  const raw = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) throw new AppError(`${fieldName} is invalid`, 400);
  return raw;
};
const LESSON_POPULATE = [
  { path: "gradeId", select: "_id label" },
  { path: "subjectId", select: "_id name" },
];
const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Teacher/Admin: create lesson
 * POST /
 */
export const createLesson = catchAsync(async (req, res) => {
  const created = await lessonService.createLessonFromForm({
    user: req.user,
    payload: req.body,
    files: req.files,
  });
  const data = await Lesson.findById(created._id)
    .select("-classInfo -classId")
    .populate(LESSON_POPULATE)
    .lean();

  res.status(201).json({ success: true, data });
});

/**
 * Student/Teacher: list lessons by grade + subject scope
 * GET /scope?gradeId=...&subjectId=...
 *
 * - Student: must match grade + assigned subject
 * - Teacher: must match own subject + assigned grades
 */
export const getScopedLessons = catchAsync(async (req, res) => {
  const rawGradeId = req.query.gradeId;
  const rawSubjectId = req.query.subjectId;

  let gradeId = null;
  let subjectId = null;
  let grade = null;
  let subject = null;

  if (rawGradeId !== undefined) {
    gradeId = toObjectId(rawGradeId, "gradeId");
    grade = await Grade.findById(gradeId).lean();
    if (!grade) throw new AppError("Grade not found", 404);
  }

  if (rawSubjectId !== undefined) {
    subjectId = toObjectId(rawSubjectId, "subjectId");
    subject = await Subject.findById(subjectId).lean();
    if (!subject) throw new AppError("Subject not found", 404);
  }

  const filter = {};

  if (req.user.role === "teacher") {
    const ownSubject = await Subject.findOne({
      name: { $regex: `^${escapeRegex(req.user.subject)}$`, $options: "i" },
    })
      .select("_id name")
      .lean();
    if (!ownSubject) throw new AppError("Teacher subject not found", 400);

    if (subject && norm(req.user.subject) !== norm(subject.name)) {
      throw new AppError("You can only view your own subject lessons", 403);
    }

    filter.createdBy = req.user._id;
    filter.subjectId = subjectId || ownSubject._id;

    const grades = Array.isArray(req.user.assignedGrades) ? req.user.assignedGrades : [];
    const allowedGradeDocs = await Grade.find({ label: { $in: grades } }).select("_id label").lean();
    const allowedGradeIds = allowedGradeDocs.map((g) => String(g._id));

    if (gradeId) {
      if (!allowedGradeIds.includes(String(gradeId))) {
        throw new AppError("You are not assigned to this grade", 403);
      }
      filter.gradeId = gradeId;
    } else if (allowedGradeIds.length) {
      filter.gradeId = { $in: allowedGradeIds };
    } else {
      return res.json({ success: true, data: [] });
    }

    const data = await Lesson.find(filter)
      .select("-classInfo -classId")
      .populate(LESSON_POPULATE)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data });
  }

  if (req.user.role === "student") {
    const studentGrade = await Grade.findOne({ label: req.user.gradeLevel }).select("_id label").lean();
    if (!studentGrade) throw new AppError("Student grade not found", 400);

    if (gradeId && String(studentGrade._id) !== String(gradeId)) {
      throw new AppError("This grade is not for you", 403);
    }
    filter.gradeId = studentGrade._id;

    const assignedSubjectNames = Array.isArray(req.user.assignedSubjects) ? req.user.assignedSubjects : [];
    const normalizedAssigned = assignedSubjectNames.map(norm);
    const assignedSubjects = await Subject.find({})
      .select("_id name")
      .lean();
    const assignedSubjectIds = assignedSubjects
      .filter((s) => normalizedAssigned.includes(norm(s.name)))
      .map((s) => String(s._id));

    if (subjectId) {
      if (!assignedSubjectIds.includes(String(subjectId))) {
        throw new AppError("You are not assigned to this subject", 403);
      }
      filter.subjectId = subjectId;
    } else if (assignedSubjectIds.length) {
      filter.subjectId = { $in: assignedSubjectIds };
    } else {
      return res.json({ success: true, data: [] });
    }

    const data = await Lesson.find({ ...filter, status: "published" })
      .select("-classInfo -classId")
      .populate(LESSON_POPULATE)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data });
  }

  if (req.user.role === "admin") {
    if (gradeId) filter.gradeId = gradeId;
    if (subjectId) filter.subjectId = subjectId;

    const data = await Lesson.find(filter)
      .select("-classInfo -classId")
      .populate(LESSON_POPULATE)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data });
  }

  throw new AppError("Forbidden", 403);
});

/**
 * Get lesson by id
 */
export const getLessonById = catchAsync(async (req, res) => {
  const lessonId = req.params.lessonId;

  const lesson = await Lesson.findById(lessonId)
    .select("-classInfo -classId")
    .populate(LESSON_POPULATE)
    .lean();
  if (!lesson) throw new AppError("Lesson not found", 404);

  const [grade, subject] = await Promise.all([
    Grade.findById(lesson.gradeId?._id || lesson.gradeId).lean(),
    Subject.findById(lesson.subjectId?._id || lesson.subjectId).lean(),
  ]);
  if (!grade || !subject) throw new AppError("Lesson scope is invalid", 400);

  if (req.user.role === "teacher") {
    if (String(lesson.createdBy) !== String(req.user._id)) {
      throw new AppError("Forbidden", 403);
    }
    if (norm(req.user.subject) !== norm(subject.name)) throw new AppError("Forbidden", 403);
    const grades = Array.isArray(req.user.assignedGrades) ? req.user.assignedGrades : [];
    if (!grades.map(norm).includes(norm(grade.label))) throw new AppError("Forbidden", 403);
    return res.json({ success: true, data: lesson });
  }

  if (req.user.role === "admin") {
    return res.json({ success: true, data: lesson });
  }

  if (req.user.role === "student") {
    if (lesson.status !== "published") throw new AppError("Lesson not available", 403);
    if (norm(req.user.gradeLevel) !== norm(grade.label)) throw new AppError("Forbidden", 403);
    const subjects = Array.isArray(req.user.assignedSubjects) ? req.user.assignedSubjects : [];
    if (!subjects.map(norm).includes(norm(subject.name))) throw new AppError("Forbidden", 403);
    return res.json({ success: true, data: lesson });
  }

  throw new AppError("Forbidden", 403);
});

/**
 * Teacher/Admin: update lesson
 * PATCH /:lessonId
 */
export const updateLesson = catchAsync(async (req, res) => {
  const updated = await lessonService.updateLessonById({
    user: req.user,
    lessonId: req.params.lessonId,
    payload: req.body,
    files: req.files,
  });
  const data = await Lesson.findById(updated._id)
    .select("-classInfo -classId")
    .populate(LESSON_POPULATE)
    .lean();

  res.json({ success: true, data });
});

/**
 * Teacher/Admin: delete lesson
 * DELETE /:lessonId
 */
export const deleteLesson = catchAsync(async (req, res) => {
  const data = await lessonService.deleteLessonById({
    user: req.user,
    lessonId: req.params.lessonId,
  });

  res.json({ success: true, data });
});
