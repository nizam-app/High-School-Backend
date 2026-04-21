
import express from "express";
import {
  createSession,
  getTeacherSessions,
  getStudentSessions,
  getPendingSessions,
  getAllSessions,
  approveSession,
  rejectSession,
  getSessionById,
  joinSession,
  joinAttendance,
  leaveAttendance,
  startSession,
  markAttendance,
  completeSession,
  updateSession,
  cancelSession,
} from "./session.controller.js";
import { restrictTo , requireAuth} from "../../middlewares/auth.js";

const router = express.Router();

// Teacher routes
router.post("/", requireAuth, restrictTo("teacher"), createSession);
router.get("/teacher", requireAuth, restrictTo("teacher"), getTeacherSessions);
router.get("/teacher/:id", requireAuth, restrictTo("teacher"), getSessionById);
router.put("/:id", requireAuth, restrictTo("teacher"), updateSession);
router.put("/:id/start", requireAuth, restrictTo("teacher"), startSession);
router.put("/:id/complete", requireAuth, restrictTo("teacher"), completeSession);

// Student routes
router.get("/student", requireAuth, restrictTo("student"), getStudentSessions);
router.get("/student/:id", requireAuth, restrictTo("student"), getSessionById);
router.post("/join", requireAuth, restrictTo("student"), joinAttendance);
router.post("/leave", requireAuth, restrictTo("student"), leaveAttendance);
router.post("/:id/join", requireAuth, restrictTo("student", "admin"), joinSession);

// Admin routes
router.get("/admin/pending", requireAuth, restrictTo("admin"), getPendingSessions);
router.get("/admin/all", requireAuth, restrictTo("admin"), getAllSessions);
router.put("/:id/approve", requireAuth, restrictTo("admin"), approveSession);
router.put("/:id/reject", requireAuth, restrictTo("admin"), rejectSession);

// Shared routes
router.get("/:id", requireAuth, getSessionById);
router.put(
  "/:sessionId/attendance/:studentId",
  requireAuth,
  restrictTo("teacher", "admin"),
  markAttendance
);
router.delete("/:id", requireAuth, restrictTo("teacher", "admin"), cancelSession);

export default router;
