import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as adminLessonsService from "./adminLessons.service.js";

export const getLessons = catchAsync(async (req, res) => {
  const result = await adminLessonsService.listAdminLessons(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin lessons fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

export const getLessonById = catchAsync(async (req, res) => {
  const data = await adminLessonsService.getAdminLessonById(req.params.id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin lesson fetched successfully",
    data,
  });
});

export const updateLesson = catchAsync(async (req, res) => {
  const data = await adminLessonsService.updateAdminLesson({
    lessonId: req.params.id,
    payload: req.body,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin lesson updated successfully",
    data,
  });
});

export const deleteLesson = catchAsync(async (req, res) => {
  const data = await adminLessonsService.deleteAdminLesson(req.params.id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin lesson deleted successfully",
    data,
  });
});

export const getLessonsMeta = catchAsync(async (req, res) => {
  const data = await adminLessonsService.getAdminLessonsMeta();
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin lessons meta fetched successfully",
    data,
  });
});
