import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as classService from "./class.service.js";

// Admin create class
export const createClass = catchAsync(async (req, res) => {
  const cls = await classService.createClass(req.body);

  return sendResponse(res, {
    statusCode: 201,
    message: "Class created successfully",
    data: cls,
  });
});

// Teacher my classes
export const getMyClasses = catchAsync(async (req, res) => {
  const classes = await classService.getMyClasses(req.user._id);

  return sendResponse(res, {
    statusCode: 200,
    message: "My classes fetched successfully",
    data: classes,
  });
});

// Admin list all classes
export const listClassesAdmin = catchAsync(async (req, res) => {
  const classes = await classService.listClassesAdmin();

  return sendResponse(res, {
    statusCode: 200,
    message: "All classes fetched successfully",
    data: classes,
  });
});

// Get single class
export const getClassById = catchAsync(async (req, res) => {
  const cls = await classService.getClassById(req.params.classId, req.user);

  return sendResponse(res, {
    statusCode: 200,
    message: "Class fetched successfully",
    data: cls,
  });
});
export const addScheduleToClass = catchAsync(async (req, res) => {
  const cls = await classService.addScheduleToClass({
    classId: req.params.classId,
    scheduleInput: req.body.schedule,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Schedule added successfully",
    data: cls,
  });
});

export const replaceClassSchedule = catchAsync(async (req, res) => {
  const cls = await classService.replaceClassSchedule({
    classId: req.params.classId,
    scheduleInput: req.body.schedule,
  });

  return sendResponse(res, {
    statusCode: 200,
    message: "Schedule replaced successfully",
    data: cls,
  });
});

export const getStudentClasses = catchAsync(async (req, res) => {
  const classes = await classService.getStudentClasses(req.user);

  return sendResponse(res, {
    statusCode: 200,
    message: "Student classes fetched successfully",
    data: classes,
  });
});

export const getStudentClassById = catchAsync(async (req, res) => {
  const cls = await classService.getStudentClassById(req.user, req.params.classId);

  return sendResponse(res, {
    statusCode: 200,
    message: "Student class fetched successfully",
    data: cls,
  });
});
