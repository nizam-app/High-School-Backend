import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as themeSettingsService from "./themeSettings.service.js";

export const getThemeSettings = catchAsync(async (req, res) => {
  const data = await themeSettingsService.getThemeSettings();
  return sendResponse(res, {
    statusCode: 200,
    message: "Theme settings fetched successfully",
    data,
  });
});

export const putThemeSettings = catchAsync(async (req, res) => {
  const data = await themeSettingsService.replaceThemeSettings({
    payload: req.validatedThemeSettings,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Theme settings updated successfully",
    data,
  });
});

export const patchThemeMode = catchAsync(async (req, res) => {
  const data = await themeSettingsService.updateThemeSettings({
    payload: req.validatedThemeSettings,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Theme mode updated successfully",
    data,
  });
});

export const patchThemeLight = catchAsync(async (req, res) => {
  const data = await themeSettingsService.updateThemeSettings({
    payload: req.validatedThemeSettings,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Light theme updated successfully",
    data,
  });
});

export const patchThemeDark = catchAsync(async (req, res) => {
  const data = await themeSettingsService.updateThemeSettings({
    payload: req.validatedThemeSettings,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Dark theme updated successfully",
    data,
  });
});

export const patchThemeTypography = catchAsync(async (req, res) => {
  const data = await themeSettingsService.updateThemeSettings({
    payload: req.validatedThemeSettings,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Theme typography updated successfully",
    data,
  });
});

export const resetThemeSettings = catchAsync(async (req, res) => {
  const data = await themeSettingsService.resetThemeSettings({
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Theme settings reset successfully",
    data,
  });
});
