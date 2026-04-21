
import catchAsync from "../../utils/catchAsync.js";
import  sendResponse  from "../../utils/sendResponse.js";
import { registerService, loginService, meService } from "./auth.service.js";

export const register = catchAsync(async (req, res) => {
  const data = await registerService(req.body);
  return sendResponse(res, { statusCode: 201, message: "Account created", data });
});

export const login = catchAsync(async (req, res) => {
  const data = await loginService(req.body);
  return sendResponse(res, {
    statusCode: 200,
    message: data?.requiresTwoFactor ? "Two-factor authentication required" : "Login successful",
    data,
  });
});

export const me = catchAsync(async (req, res) => {
  const data = await meService(req.user.id);
  return sendResponse(res, { statusCode: 200, message: "Profile fetched", data });
});
