import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as teacherService from "./teacher.service.js";

export const dashboard = catchAsync(async (req, res) => {
  const data = await teacherService.getTeacherDashboard(req.user._id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Teacher dashboard fetched successfully",
    data,
  });
});

export const listStudents = catchAsync(async (req, res) => {
  const result = await teacherService.listTeacherStudents(req.user._id, req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Teacher students fetched successfully",
    data: result.data,
    teacherOverview: result.teacherOverview,
  });
});

export const getStudentById = catchAsync(async (req, res) => {
  const data = await teacherService.getTeacherStudentById(req.user._id, req.params.studentId);
  return sendResponse(res, {
    statusCode: 200,
    message: "Teacher student fetched successfully",
    data,
  });
});

export const studentsStats = catchAsync(async (req, res) => {
  const data = await teacherService.getTeacherStudentsStats(req.user._id, req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Teacher students stats fetched successfully",
    data,
  });
});

export const studentProgress = catchAsync(async (req, res) => {
  const data = await teacherService.getTeacherStudentProgress(
    req.user._id,
    req.params.studentId,
    req.query.classId || null
  );
  return sendResponse(res, {
    statusCode: 200,
    message: "Teacher student progress fetched successfully",
    data,
  });
});

export const studentAttendance = catchAsync(async (req, res) => {
  const data = await teacherService.getTeacherStudentAttendance(
    req.user._id,
    req.params.studentId,
    req.query.classId || null
  );
  return sendResponse(res, {
    statusCode: 200,
    message: "Teacher student attendance fetched successfully",
    data,
  });
});

export const markStudentAttendance = catchAsync(async (req, res) => {
  const data = await teacherService.markTeacherStudentAttendance(
    req.user._id,
    req.params.studentId,
    req.body || {}
  );
  return sendResponse(res, {
    statusCode: 200,
    message: "Teacher student attendance marked successfully",
    data,
  });
});

export const listTeachersForAdmin = catchAsync(async (req, res) => {
  const data = await teacherService.listTeachersForAdmin(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Teachers fetched successfully",
    data,
  });
});
