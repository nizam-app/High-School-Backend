import { catchAsync } from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as profileService from "./profile.service.js";
import { buildStoredFileMeta } from "../../utils/fileStorage.js";

const withUploadedImage = (req) => {
  const payload = { ...req.body };
  if (req.file) {
    const meta = buildStoredFileMeta(req.file, "profiles");
    payload.profileImage = meta?.url || payload.profileImage;
  }
  return payload;
};

export const createMyProfile = catchAsync(async (req, res) => {
  const data = await profileService.createMyProfile(
    req.user._id,
    withUploadedImage(req)
  );
  return sendResponse(res, {
    statusCode: 201,
    message: "Profile created",
    data,
  });
});

export const createProfileByUserId = catchAsync(async (req, res) => {
  const data = await profileService.createProfileByUserId(
    req.params.userId,
    withUploadedImage(req)
  );
  return sendResponse(res, {
    statusCode: 201,
    message: "Profile created",
    data,
  });
});

export const getMyProfile = catchAsync(async (req, res) => {
  const data = await profileService.getMyProfile(req.user._id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Profile fetched",
    data,
  });
});

export const updateMyProfile = catchAsync(async (req, res) => {
  const data = await profileService.updateMyProfile(
    req.user._id,
    withUploadedImage(req)
  );
  return sendResponse(res, {
    statusCode: 200,
    message: "Profile updated",
    data,
  });
});

export const deleteMyProfile = catchAsync(async (req, res) => {
  const data = await profileService.deleteMyProfile(req.user._id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Profile deleted",
    data,
  });
});

export const getAllProfiles = catchAsync(async (req, res) => {
  const data = await profileService.getAllProfiles(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Profiles fetched",
    data,
  });
});

export const getProfileById = catchAsync(async (req, res) => {
  const data = await profileService.getProfileById(req.params.id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Profile fetched",
    data,
  });
});

export const updateProfileById = catchAsync(async (req, res) => {
  const data = await profileService.updateProfileById(
    req.params.id,
    withUploadedImage(req),
    req.user
  );
  return sendResponse(res, {
    statusCode: 200,
    message: "Profile updated",
    data,
  });
});

export const deleteProfileById = catchAsync(async (req, res) => {
  const data = await profileService.deleteProfileById(req.params.id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Profile deleted",
    data,
  });
});
