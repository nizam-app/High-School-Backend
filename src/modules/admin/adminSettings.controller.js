import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as adminSettingsService from "./adminSettings.service.js";

export const getSettings = catchAsync(async (req, res) => {
  const data = await adminSettingsService.getAdminSettings();
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin settings fetched successfully",
    data,
  });
});

export const updateGeneralSettings = catchAsync(async (req, res) => {
  const data = await adminSettingsService.updateGeneralSettings({
    payload: req.body,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "General settings updated successfully",
    data,
  });
});

export const updateSecuritySettings = catchAsync(async (req, res) => {
  const data = await adminSettingsService.updateSecuritySettings({
    payload: req.body,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Security settings updated successfully",
    data,
  });
});

export const getSubjectsGradesSettings = catchAsync(async (req, res) => {
  const data = await adminSettingsService.getSettingsSubjectsGrades();
  return sendResponse(res, {
    statusCode: 200,
    message: "Subjects and grades settings fetched successfully",
    data,
  });
});
