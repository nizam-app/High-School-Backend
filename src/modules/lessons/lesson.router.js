import express from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import { makeUploader } from "../../middlewares/upload.js";
import * as lessonController from "./lesson.controller.js";

const router = express.Router();
const uploadLesson = makeUploader("lessons");

// Teacher/Admin create lesson
// Teacher/Admin create lesson
router.post(
  "/",
  requireAuth,
  restrictTo("teacher", "admin"),
  uploadLesson.array("files", 5),
  lessonController.createLesson
);

// Teacher/Admin update lesson
router.patch(
  "/:lessonId",
  requireAuth,
  restrictTo("teacher", "admin"),
  uploadLesson.array("files", 5),
  lessonController.updateLesson
);

// Teacher/Admin delete lesson
router.delete(
  "/:lessonId",
  requireAuth,
  restrictTo("teacher", "admin"),
  lessonController.deleteLesson
);


// Student/Teacher/Admin: lessons by grade+subject scope
router.get(
  "/scope",
  requireAuth,
  restrictTo("student", "teacher", "admin"),
  lessonController.getScopedLessons
);

router.get(
  "/:lessonId",
  requireAuth,
  restrictTo("student", "teacher", "admin"),
  lessonController.getLessonById
);

export default router;
