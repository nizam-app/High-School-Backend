import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as adminAssignmentsService from "./adminAssignments.service.js";

export const getAssignments = catchAsync(async (req, res) => {
  const result = await adminAssignmentsService.listAdminAssignments(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin assignments fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

export const getAssignmentStats = catchAsync(async (req, res) => {
  const data = await adminAssignmentsService.getAdminAssignmentsStats();
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin assignments stats fetched successfully",
    data,
  });
});

export const createAssignment = catchAsync(async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];
  const data = await adminAssignmentsService.createAdminAssignment({
    payload: req.body,
    files,
  });

  return sendResponse(res, {
    statusCode: 201,
    message: "Admin assignment created successfully",
    data,
  });
});

export const updateAssignment = catchAsync(async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];
  const data = await adminAssignmentsService.updateAdminAssignment({
    assignmentId: req.params.id,
    payload: req.body,
    files,
    adminUser: req.user,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Admin assignment updated successfully",
    data,
  });
});

export const getAssignmentSubmissions = catchAsync(async (req, res) => {
  const data = await adminAssignmentsService.getAdminAssignmentSubmissions({
    assignmentId: req.params.id,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Admin assignment submissions fetched successfully",
    data,
  });
});
