import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as generalSettingsService from "./generalSettings.service.js";

export const getGeneralSettings = catchAsync(async (req, res) => {
  const data = await generalSettingsService.getGeneralSettings();
  return sendResponse(res, {
    statusCode: 200,
    message: "General settings fetched successfully",
    data,
  });
});

export const updateGeneralSettings = catchAsync(async (req, res) => {
  const data = await generalSettingsService.updateGeneralSettings({
    payload: req.validatedGeneralSettings,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "General settings updated successfully",
    data,
  });
});
