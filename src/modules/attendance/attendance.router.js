import { Router } from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import * as attendanceController from "./attendance.controller.js";

const router = Router();

router.post(
  "/classes/:classId",
  requireAuth,
  restrictTo("teacher", "admin"),
  attendanceController.markClassAttendance
);

router.get(
  "/classes/:classId",
  requireAuth,
  restrictTo("teacher", "admin"),
  attendanceController.getClassAttendance
);

router.get(
  "/students/:studentId/summary",
  requireAuth,
  restrictTo("teacher", "admin"),
  attendanceController.getStudentAttendanceSummary
);

export default router;
