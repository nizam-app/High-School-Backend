import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as adminTimetableService from "./adminTimetable.service.js";

export const getTimetable = catchAsync(async (req, res) => {
  const [timetable, meta] = await Promise.all([
    adminTimetableService.getAdminTimetable(req.query),
    adminTimetableService.getTimetableMeta(),
  ]);

  const data = {
    mode: timetable.mode,
    entries: timetable.data,
    groupedByDay: timetable.groupedByDay,
    teachers: meta.teachers,
    subjects: meta.subjects,
    grades: meta.grades,
    classes: meta.classes,
  };

  return sendResponse(res, {
    statusCode: 200,
    message: "Admin timetable fetched successfully",
    data,
  });
});

export const createTimetableEntry = catchAsync(async (req, res) => {
  const data = await adminTimetableService.createTimetableEntry(req.body, req.user?._id || null);
  return sendResponse(res, {
    statusCode: 201,
    message: "Timetable entry created successfully",
    data,
  });
});

export const updateTimetableEntry = catchAsync(async (req, res) => {
  const data = await adminTimetableService.updateTimetableEntry(
    req.params.id,
    req.body,
    req.user?._id || null
  );
  return sendResponse(res, {
    statusCode: 200,
    message: "Timetable entry updated successfully",
    data,
  });
});

export const deleteTimetableEntry = catchAsync(async (req, res) => {
  const hardDelete =
    String(req.query.hardDelete || "").trim().toLowerCase() === "true" ||
    req.body?.hardDelete === true;
  const data = await adminTimetableService.deleteTimetableEntry(req.params.id, hardDelete);
  return sendResponse(res, {
    statusCode: 200,
    message: "Timetable entry deleted successfully",
    data,
  });
});

export const getTimetableMeta = catchAsync(async (req, res) => {
  const data = await adminTimetableService.getTimetableMeta();
  return sendResponse(res, {
    statusCode: 200,
    message: "Timetable meta fetched successfully",
    data,
  });
});
