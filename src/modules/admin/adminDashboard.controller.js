import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { getAdminDashboardOverview } from "./adminDashboard.service.js";

export const getDashboardOverview = catchAsync(async (req, res) => {
  const data = await getAdminDashboardOverview();

  return sendResponse(res, {
    statusCode: 200,
    message: "Admin dashboard overview fetched successfully",
    data,
  });
});
