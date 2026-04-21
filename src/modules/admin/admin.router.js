import { Router } from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import { getDashboardOverview } from "./adminDashboard.controller.js";
import { makeUploader } from "../../middlewares/upload.js";
import {
  createUser,
  deleteUser,
  getUsers,
  getUsersStats,
  updateUser,
  updateUserStatus,
} from "./adminUsers.controller.js";
import {
  createClass,
  deleteClass,
  getClasses,
  getContentStats,
  getGradesSections,
  getSubjectsSummary,
  updateClass,
} from "./adminClassesContent.controller.js";
import {
  createAssignment,
  getAssignments,
  getAssignmentStats,
  getAssignmentSubmissions,
  updateAssignment,
} from "./adminAssignments.controller.js";
import {
  deleteLesson,
  getLessonById,
  getLessons,
  getLessonsMeta,
  updateLesson,
} from "./adminLessons.controller.js";
import {
  approveLiveSession,
  cancelLiveSession,
  createLiveSession,
  getLiveSessions,
  getLiveSessionsStats,
  rejectLiveSession,
  updateLiveSession,
} from "./adminLiveSessions.controller.js";
import {
  createTimetableEntry,
  deleteTimetableEntry,
  getTimetable,
  getTimetableMeta,
  updateTimetableEntry,
} from "./adminTimetable.controller.js";
import {
  cancelScheduledNotification,
  createNotification,
  getNotifications,
  getNotificationsStats,
  getNotificationStatsById,
  rescheduleNotification,
  sendNotificationNow,
  updateNotification,
} from "./adminNotifications.controller.js";
import {
  getSettings,
  getSubjectsGradesSettings,
  updateSecuritySettings,
} from "./adminSettings.controller.js";
import generalSettingsRouter from "../settings/generalSettings.router.js";
import themeSettingsRouter from "../settings/themeSettings.router.js";
import {
  getOverview as getAnalyticsOverview,
  getStudentProgress as getAnalyticsStudentProgress,
  getTeacherActivity as getAnalyticsTeacherActivity,
} from "./adminAnalytics.controller.js";

const router = Router();
const uploadAssignment = makeUploader("assignments");

router.use("/settings", generalSettingsRouter);
router.use("/settings/theme", themeSettingsRouter);

router.get("/dashboard/overview", requireAuth, restrictTo("admin"), getDashboardOverview);
router.get("/users/stats", requireAuth, restrictTo("admin"), getUsersStats);
router.get("/users", requireAuth, restrictTo("admin"), getUsers);
router.post("/users", requireAuth, restrictTo("admin"), createUser);
router.patch("/users/:id/status", requireAuth, restrictTo("admin"), updateUserStatus);
router.patch("/users/:id", requireAuth, restrictTo("admin"), updateUser);
router.delete("/users/:id", requireAuth, restrictTo("admin"), deleteUser);

router.get("/classes", requireAuth, restrictTo("admin"), getClasses);
router.post("/classes", requireAuth, restrictTo("admin"), createClass);
router.patch("/classes/:id", requireAuth, restrictTo("admin"), updateClass);
router.delete("/classes/:id", requireAuth, restrictTo("admin"), deleteClass);

router.get("/subjects/summary", requireAuth, restrictTo("admin"), getSubjectsSummary);
router.get("/grades/sections", requireAuth, restrictTo("admin"), getGradesSections);
router.get("/content/stats", requireAuth, restrictTo("admin"), getContentStats);

router.get("/assignments/stats", requireAuth, restrictTo("admin"), getAssignmentStats);
router.get("/assignments", requireAuth, restrictTo("admin"), getAssignments);
router.post(
  "/assignments",
  requireAuth,
  restrictTo("admin"),
  uploadAssignment.array("files", 5),
  createAssignment
);
router.patch(
  "/assignments/:id",
  requireAuth,
  restrictTo("admin"),
  uploadAssignment.array("files", 5),
  updateAssignment
);
router.get(
  "/assignments/:id/submissions",
  requireAuth,
  restrictTo("admin"),
  getAssignmentSubmissions
);

router.get("/lessons/meta", requireAuth, restrictTo("admin"), getLessonsMeta);
router.get("/lessons", requireAuth, restrictTo("admin"), getLessons);
router.get("/lessons/:id", requireAuth, restrictTo("admin"), getLessonById);
router.patch("/lessons/:id", requireAuth, restrictTo("admin"), updateLesson);
router.delete("/lessons/:id", requireAuth, restrictTo("admin"), deleteLesson);

router.get("/live-sessions/stats", requireAuth, restrictTo("admin"), getLiveSessionsStats);
router.get("/live-sessions", requireAuth, restrictTo("admin"), getLiveSessions);
router.post("/live-sessions", requireAuth, restrictTo("admin"), createLiveSession);
router.patch("/live-sessions/:id", requireAuth, restrictTo("admin"), updateLiveSession);
router.patch("/live-sessions/:id/approve", requireAuth, restrictTo("admin"), approveLiveSession);
router.patch("/live-sessions/:id/reject", requireAuth, restrictTo("admin"), rejectLiveSession);
router.delete("/live-sessions/:id", requireAuth, restrictTo("admin"), cancelLiveSession);

router.get("/timetable/meta", requireAuth, restrictTo("admin"), getTimetableMeta);
router.get("/timetable", requireAuth, restrictTo("admin"), getTimetable);
router.post("/timetable/entries", requireAuth, restrictTo("admin"), createTimetableEntry);
router.patch("/timetable/entries/:id", requireAuth, restrictTo("admin"), updateTimetableEntry);
router.delete("/timetable/entries/:id", requireAuth, restrictTo("admin"), deleteTimetableEntry);

router.get("/notifications/stats", requireAuth, restrictTo("admin"), getNotificationsStats);
router.get("/notifications/:id/stats", requireAuth, restrictTo("admin"), getNotificationStatsById);
router.get("/notifications", requireAuth, restrictTo("admin"), getNotifications);
router.post("/notifications", requireAuth, restrictTo("admin"), createNotification);
router.patch("/notifications/:id", requireAuth, restrictTo("admin"), updateNotification);
router.post("/notifications/:id/send", requireAuth, restrictTo("admin"), sendNotificationNow);
router.patch("/notifications/:id/cancel", requireAuth, restrictTo("admin"), cancelScheduledNotification);
router.patch("/notifications/:id/reschedule", requireAuth, restrictTo("admin"), rescheduleNotification);

router.get("/settings/subjects-grades", requireAuth, restrictTo("admin"), getSubjectsGradesSettings);
router.get("/settings", requireAuth, restrictTo("admin"), getSettings);
router.patch("/settings/security", requireAuth, restrictTo("admin"), updateSecuritySettings);

router.get("/analytics/overview", requireAuth, restrictTo("admin"), getAnalyticsOverview);
router.get(
  "/analytics/student-progress",
  requireAuth,
  restrictTo("admin"),
  getAnalyticsStudentProgress
);
router.get(
  "/analytics/teacher-activity",
  requireAuth,
  restrictTo("admin"),
  getAnalyticsTeacherActivity
);

export default router;
