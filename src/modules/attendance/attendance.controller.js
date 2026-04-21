import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as attendanceService from "./attendance.service.js";

export const markClassAttendance = catchAsync(async (req, res) => {
  const data = await attendanceService.upsertClassAttendance({
    classId: req.params.classId,
    actor: req.user,
    payload: req.body,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Attendance saved successfully",
    data,
  });
});

export const getClassAttendance = catchAsync(async (req, res) => {
  const data = await attendanceService.getClassAttendance({
    classId: req.params.classId,
    actor: req.user,
    query: req.query,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Class attendance fetched successfully",
    data,
  });
});

export const getStudentAttendanceSummary = catchAsync(async (req, res) => {
  const data = await attendanceService.getStudentAttendanceSummary({
    studentId: req.params.studentId,
    actor: req.user,
    query: req.query,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Student attendance summary fetched successfully",
    data,
  });
});
