import express from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import { makeUploader } from "../../middlewares/upload.js";
import * as assignmentController from "./assignment.controller.js";

const router = express.Router();
const uploadAssignment = makeUploader("assignments");

// Teacher: create assignment
router.post(
  "/",
  requireAuth,
  restrictTo("teacher"),
  uploadAssignment.single("file"), // form-data key: file
  assignmentController.createAssignment
);

// Student: list assignments by gradeId + subjectId
router.get(
  "/scope",
  requireAuth,
  restrictTo("student"),
  assignmentController.getClassAssignmentsForStudent
);

// Student: list my assignments by grade + subject
router.get(
  "/student/my",
  requireAuth,
  restrictTo("student"),
  assignmentController.getMyAssignmentsForStudent
);

// Student: list only pending assignments for my grade + subjects
router.get(
  "/student/pending",
  requireAuth,
  restrictTo("student"),
  assignmentController.getPendingAssignmentsForStudent
);

// Admin: overview
router.get(
  "/admin",
  requireAuth,
  restrictTo("admin"),
  assignmentController.adminAssignmentsOverview
);

// Admin: submissions of one assignment
router.get(
  "/admin/:assignmentId/submissions",
  requireAuth,
  restrictTo("admin"),
  assignmentController.adminAssignmentSubmissions
);

// Teacher/Admin: edit assignment
router.patch(
  "/:assignmentId",
  requireAuth,
  restrictTo("teacher", "admin"),
  uploadAssignment.single("file"),
  assignmentController.updateAssignment
);

// Teacher/Admin: delete assignment
router.delete(
  "/:assignmentId",
  requireAuth,
  restrictTo("teacher", "admin"),
  assignmentController.deleteAssignment
);

// Student: assignment detail
router.get(
  "/:assignmentId",
  requireAuth,
  restrictTo("student"),
  assignmentController.getAssignmentDetailsForStudent
);

// Teacher: submissions list
router.get(
  "/:assignmentId/submissions",
  requireAuth,
  restrictTo("teacher"),
  assignmentController.getTeacherSubmissions
);

export default router;
