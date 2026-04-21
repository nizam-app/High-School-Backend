import { Router } from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import * as teacherController from "./teacher.controller.js";

const router = Router();

router.get("/", requireAuth, restrictTo("admin"), teacherController.listTeachersForAdmin);
router.get("/dashboard", requireAuth, restrictTo("teacher"), teacherController.dashboard);
router.get("/students", requireAuth, restrictTo("teacher"), teacherController.listStudents);
router.get("/students/:studentId", requireAuth, restrictTo("teacher"), teacherController.getStudentById);
router.get("/stats/students", requireAuth, restrictTo("teacher"), teacherController.studentsStats);
router.get(
  "/students/:studentId/progress",
  requireAuth,
  restrictTo("teacher"),
  teacherController.studentProgress
);
router.get(
  "/students/:studentId/attendance",
  requireAuth,
  restrictTo("teacher"),
  teacherController.studentAttendance
);
router.post(
  "/students/:studentId/attendance",
  requireAuth,
  restrictTo("teacher"),
  teacherController.markStudentAttendance
);

export default router;
