import { catchAsync } from "../../utils/catchAsync.js";
import * as studentService from "./student.service.js";

export const myClasses = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const data = await studentService.getMyClasses(studentId);

  res.json({ success: true, data });
});

export const progressOverview = catchAsync(async (req, res) => {
  const data = await studentService.getStudentProgressOverview(req.user._id);
  res.json({ success: true, data });
});

export const dashboard = catchAsync(async (req, res) => {
  const data = await studentService.getStudentDashboard(req.user._id);
  res.json({ success: true, data });
});

export const timetable = catchAsync(async (req, res) => {
  const data = await studentService.getStudentTimetable(req.user._id);
  res.json({ success: true, data });
});
