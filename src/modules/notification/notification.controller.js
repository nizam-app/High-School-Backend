import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import {
  getCurrentUserUnreadCount,
  listCurrentUserNotifications,
  markUserNotificationRead,
} from "./notification.service.js";

export const getMyNotifications = catchAsync(async (req, res) => {
  const result = await listCurrentUserNotifications(req.user?._id, req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "User notifications fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});

export const markAsRead = catchAsync(async (req, res) => {
  const data = await markUserNotificationRead({
    userId: req.user?._id,
    userNotificationId: req.params.id,
  });
  return sendResponse(res, {
    statusCode: 200,
    message: "Notification marked as read successfully",
    data,
  });
});

export const getUnreadCount = catchAsync(async (req, res) => {
  const data = await getCurrentUserUnreadCount(req.user?._id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Unread notification count fetched successfully",
    data,
  });
});
