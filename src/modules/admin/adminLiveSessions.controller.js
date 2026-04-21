import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as adminLiveSessionsService from "./adminLiveSessions.service.js";

export const getLiveSessions = catchAsync(async (req, res) => {
  const result = await adminLiveSessionsService.listAdminLiveSessions(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin live sessions fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

export const getLiveSessionsStats = catchAsync(async (req, res) => {
  const data = await adminLiveSessionsService.getAdminLiveSessionsStats();
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin live sessions stats fetched successfully",
    data,
  });
});

export const createLiveSession = catchAsync(async (req, res) => {
  const data = await adminLiveSessionsService.createAdminLiveSession({
    payload: req.body,
  });
  return sendResponse(res, {
    statusCode: 201,
    message: "Admin live session scheduled successfully",
    data,
  });
});

export const updateLiveSession = catchAsync(async (req, res) => {
  const data = await adminLiveSessionsService.updateAdminLiveSession({
    sessionId: req.params.id,
    payload: req.body,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin live session updated successfully",
    data,
  });
});

export const approveLiveSession = catchAsync(async (req, res) => {
  const data = await adminLiveSessionsService.approveAdminLiveSession({
    sessionId: req.params.id,
    adminId: req.user._id,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin live session approved successfully",
    data,
  });
});

export const rejectLiveSession = catchAsync(async (req, res) => {
  const data = await adminLiveSessionsService.rejectAdminLiveSession({
    sessionId: req.params.id,
    adminId: req.user._id,
    reason: req.body?.reason,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin live session rejected successfully",
    data,
  });
});

export const cancelLiveSession = catchAsync(async (req, res) => {
  const data = await adminLiveSessionsService.cancelAdminLiveSession({
    sessionId: req.params.id,
    adminId: req.user._id,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin live session cancelled successfully",
    data,
  });
});
