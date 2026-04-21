import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import {
  getAdminAnalyticsOverview,
  getAdminAnalyticsStudentProgress,
  getAdminAnalyticsTeacherActivity,
} from "./adminAnalytics.service.js";

export const getOverview = catchAsync(async (req, res) => {
  const data = await getAdminAnalyticsOverview(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin analytics overview fetched successfully",
    data,
  });
});

export const getStudentProgress = catchAsync(async (req, res) => {
  const data = await getAdminAnalyticsStudentProgress(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin analytics student progress fetched successfully",
    data,
  });
});

export const getTeacherActivity = catchAsync(async (req, res) => {
  const data = await getAdminAnalyticsTeacherActivity(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Admin analytics teacher activity fetched successfully",
    data,
  });
});
