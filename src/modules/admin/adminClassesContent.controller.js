import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as adminClassesContentService from "./adminClassesContent.service.js";

export const getClasses = catchAsync(async (req, res) => {
  const result = await adminClassesContentService.listAdminClasses(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin classes fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

export const createClass = catchAsync(async (req, res) => {
  const result = await adminClassesContentService.createAdminClass({
    payload: req.body,
  });
  return sendResponse(res, {
    statusCode: result.created ? 201 : 200,
    message: result.created
      ? "Admin class created successfully"
      : "Class already existed, updated successfully",
    data: result.classDoc,
  });
});

export const updateClass = catchAsync(async (req, res) => {
  const data = await adminClassesContentService.updateAdminClass({
    classId: req.params.id,
    payload: req.body,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin class updated successfully",
    data,
  });
});

export const deleteClass = catchAsync(async (req, res) => {
  const hardDelete =
    String(req.query.hardDelete || "").trim().toLowerCase() === "true" ||
    req.body?.hardDelete === true;
  const data = await adminClassesContentService.deleteAdminClass({
    classId: req.params.id,
    hardDelete,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin class deleted successfully",
    data,
  });
});

export const getSubjectsSummary = catchAsync(async (req, res) => {
  const result = await adminClassesContentService.getAdminSubjectsSummary(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin subjects summary fetched successfully",
    data: result.data,
  });
});

export const getGradesSections = catchAsync(async (req, res) => {
  const result = await adminClassesContentService.getAdminGradesSections(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin grades sections fetched successfully",
    data: result.data,
  });
});

export const getContentStats = catchAsync(async (req, res) => {
  const data = await adminClassesContentService.getAdminContentStats();
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin content stats fetched successfully",
    data,
  });
});
