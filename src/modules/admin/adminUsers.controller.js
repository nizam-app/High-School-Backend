import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as adminUsersService from "./adminUsers.service.js";

export const getUsers = catchAsync(async (req, res) => {
  const result = await adminUsersService.getAdminUsers(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin users fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

export const getCreateUserMeta = catchAsync(async (req, res) => {
  const data = await adminUsersService.getCreateUserMeta();
  return sendResponse(res, {
    statusCode: 200,
    message: "Create user metadata fetched",
    data,
  });
});

export const getUsersStats = catchAsync(async (req, res) => {
  const data = await adminUsersService.getAdminUsersStats();
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin user stats fetched successfully",
    data,
  });
});

export const createUser = catchAsync(async (req, res) => {
  const data = await adminUsersService.createAdminUser({
    payload: req.body,
    createdBy: req.user?._id || null,
  });

  return sendResponse(res, {
    statusCode: 201,
    message: "Admin user created successfully",
    data,
  });
});

export const updateUser = catchAsync(async (req, res) => {
  const data = await adminUsersService.updateAdminUser({
    userId: req.params.id,
    payload: req.body,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Admin user updated successfully",
    data,
  });
});

export const resetUserPin = catchAsync(async (req, res) => {
  const data = await adminUsersService.resetAdminUserPin({
    userId: req.params.id,
    pin: req.body?.pin,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "User PIN reset successfully",
    data,
  });
});

export const updateUserStatus = catchAsync(async (req, res) => {
  const data = await adminUsersService.updateAdminUserStatus({
    userId: req.params.id,
    status: req.body?.status,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Admin user status updated successfully",
    data,
  });
});

export const deleteUser = catchAsync(async (req, res) => {
  const data = await adminUsersService.deleteAdminUser({
    userId: req.params.id,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Admin user deleted successfully",
    data,
  });
});
