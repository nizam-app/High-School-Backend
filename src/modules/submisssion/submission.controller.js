import { catchAsync } from "../../utils/catchAsync.js";
import * as submissionService from "./submission.service.js";

export const submitAssignment = catchAsync(async (req, res) => {
  const data = await submissionService.submitAssignment({
    assignmentId: req.params.assignmentId,
    studentId: req.user._id,
    file: req.file,
    textAnswer: req.body?.textAnswer,
  });

  res.status(201).json({ success: true, data });
});

export const gradeSubmission = catchAsync(async (req, res) => {
  const data = await submissionService.gradeSubmission({
    submissionId: req.params.submissionId,
    graderId: req.user._id,
    score: req.body.score,
    feedback: req.body.feedback,
  });

  res.json({ success: true, data });
});

export const getMySubmission = catchAsync(async (req, res) => {
  const data = await submissionService.getMySubmission({
    assignmentId: req.params.assignmentId,
    studentId: req.user._id,
  });

  res.json({ success: true, data });
});

export const getMyPendingSubmissions = catchAsync(async (req, res) => {
  const data = await submissionService.getMyPendingSubmissions({
    studentId: req.user._id,
  });

  res.json({ success: true, data });
});
