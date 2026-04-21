import express from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import { makeUploader } from "../../middlewares/upload.js";
import * as submissionController from "./submission.controller.js";

const router = express.Router();
const uploadSubmission = makeUploader("submissions");

// Student: submit (file OR text)
router.post(
  "/:assignmentId/submit",
  requireAuth,
  restrictTo("student"),
  uploadSubmission.single("file"), // form-data key: file
  submissionController.submitAssignment
);

// Student: view my submission + grade
router.get(
  "/assignments/:assignmentId/submission/me",
  requireAuth,
  restrictTo("student"),
  submissionController.getMySubmission
);

// Student: list my submissions with status=pending
router.get(
  "/me/pending",
  requireAuth,
  restrictTo("student"),
  submissionController.getMyPendingSubmissions
);

// Teacher: grade (only assignment creator)
router.patch(
  "/submissions/:submissionId/grade",
  requireAuth,
  restrictTo("teacher"),
  submissionController.gradeSubmission
);

export default router;
