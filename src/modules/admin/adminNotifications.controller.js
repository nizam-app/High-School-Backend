import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as adminNotificationsService from "./adminNotifications.service.js";

export const getNotifications = catchAsync(async (req, res) => {
  const result = await adminNotificationsService.listAdminNotifications(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin notifications fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

export const getNotificationsStats = catchAsync(async (req, res) => {
  const data = await adminNotificationsService.getAdminNotificationsStats();
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin notifications stats fetched successfully",
    data,
  });
});

export const createNotification = catchAsync(async (req, res) => {
  const data = await adminNotificationsService.createAdminNotification({
    payload: req.body,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 201,
    message: "Admin notification created successfully",
    data,
  });
});

export const updateNotification = catchAsync(async (req, res) => {
  const data = await adminNotificationsService.updateAdminNotification({
    notificationId: req.params.id,
    payload: req.body,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin notification updated successfully",
    data,
  });
});

export const sendNotificationNow = catchAsync(async (req, res) => {
  const data = await adminNotificationsService.sendAdminNotificationNow({
    notificationId: req.params.id,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin notification sent successfully",
    data,
  });
});

export const cancelScheduledNotification = catchAsync(async (req, res) => {
  const data = await adminNotificationsService.cancelAdminScheduledNotification({
    notificationId: req.params.id,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin notification cancelled successfully",
    data,
  });
});

export const rescheduleNotification = catchAsync(async (req, res) => {
  const data = await adminNotificationsService.rescheduleAdminNotification({
    notificationId: req.params.id,
    scheduledFor: req.body?.scheduledFor,
    actorId: req.user?._id || null,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin notification rescheduled successfully",
    data,
  });
});

export const getNotificationStatsById = catchAsync(async (req, res) => {
  const data = await adminNotificationsService.getAdminNotificationStatsById(req.params.id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin notification details stats fetched successfully",
    data,
  });
});
