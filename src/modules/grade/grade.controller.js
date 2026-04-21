import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as gradeService from "./grade.service.js";

export const createGrade = catchAsync(async (req, res) => {
  const data = await gradeService.createGrade(req.body, req.user?._id || null);
  return sendResponse(res, {
    statusCode: 201,
    message: "Grade created",
    data,
  });
});

export const listGrades = catchAsync(async (req, res) => {
  const data = await gradeService.listGrades(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Grades fetched",
    data,
  });
});

export const getGradeById = catchAsync(async (req, res) => {
  const data = await gradeService.getGradeById(req.params.id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Grade fetched",
    data,
  });
});

export const updateGrade = catchAsync(async (req, res) => {
  const data = await gradeService.updateGrade(req.params.id, req.body, req.user?._id || null);
  return sendResponse(res, {
    statusCode: 200,
    message: "Grade updated",
    data,
  });
});

export const deleteGrade = catchAsync(async (req, res) => {
  const data = await gradeService.deleteGrade(req.params.id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Grade deleted",
    data,
  });
});
