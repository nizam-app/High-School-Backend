import { catchAsync } from "../../utils/catchAsync.js";
import * as assignmentService from "./assignment.service.js";

export const createAssignment = catchAsync(async (req, res) => {
  const files = Array.isArray(req.files)
    ? req.files
    : req.file
    ? [req.file]
    : [];

  const data = await assignmentService.createAssignmentFromForm({
    teacherId: req.user._id,
    payload: req.body || {},
    files,
  });

  res.status(201).json({ success: true, data });
});

export const getClassAssignmentsForStudent = catchAsync(async (req, res) => {
  const data = await assignmentService.getClassAssignmentsForStudent({
    gradeId: req.query.gradeId,
    subjectId: req.query.subjectId,
    studentId: req.user._id,
  });

  res.json({ success: true, data });
});

export const getMyAssignmentsForStudent = catchAsync(async (req, res) => {
  const result = await assignmentService.getMyAssignmentsForStudent({
    studentId: req.user._id,
    status: req.query.status,
  });

  res.json({ success: true, data: result.data, meta: result.meta });
});

export const getPendingAssignmentsForStudent = catchAsync(async (req, res) => {
  const result = await assignmentService.getPendingAssignmentsForStudent({
    studentId: req.user._id,
  });

  res.json({ success: true, data: result.data, meta: result.meta });
});

export const getAssignmentDetailsForStudent = catchAsync(async (req, res) => {
  const data = await assignmentService.getAssignmentDetailsForStudent({
    assignmentId: req.params.assignmentId,
    studentId: req.user._id,
  });

  res.json({ success: true, data });
});

export const getTeacherSubmissions = catchAsync(async (req, res) => {
  const data = await assignmentService.getTeacherSubmissions({
    assignmentId: req.params.assignmentId,
    teacherId: req.user._id,
  });

  res.json({ success: true, data });
});

export const adminAssignmentsOverview = catchAsync(async (req, res) => {
  const data = await assignmentService.adminAssignmentsOverview();
  res.json({ success: true, data });
});

export const adminAssignmentSubmissions = catchAsync(async (req, res) => {
  const data = await assignmentService.adminAssignmentSubmissions({
    assignmentId: req.params.assignmentId,
  });

  res.json({ success: true, data });
});

export const updateAssignment = catchAsync(async (req, res) => {
  const files = Array.isArray(req.files)
    ? req.files
    : req.file
    ? [req.file]
    : [];

  const data = await assignmentService.updateAssignmentById({
    assignmentId: req.params.assignmentId,
    user: req.user,
    payload: req.body || {},
    files,
  });

  res.json({ success: true, data });
});

export const deleteAssignment = catchAsync(async (req, res) => {
  const data = await assignmentService.deleteAssignmentById({
    assignmentId: req.params.assignmentId,
    user: req.user,
  });

  res.json({ success: true, data });
});
