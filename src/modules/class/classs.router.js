import { Router } from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import * as classController from "./class.controller.js";

const router = Router();

// Admin creates class
router.post("/", requireAuth, restrictTo("admin"), classController.createClass);

// Teacher gets own classes
router.get("/my", requireAuth, restrictTo("teacher"), classController.getMyClasses);

// Student gets own classes
router.get("/student/my", requireAuth, restrictTo("student"), classController.getStudentClasses);
router.get("/student/:classId", requireAuth, restrictTo("student"), classController.getStudentClassById);

// Admin lists all classes
router.get("/admin", requireAuth, restrictTo("admin"), classController.listClassesAdmin);

// Admin/Teacher fetch single class (optional)
router.get("/:classId", requireAuth, restrictTo("admin", "teacher"), classController.getClassById);
// Admin add schedule (append)
router.patch(
  "/:classId/schedule",
  requireAuth,
  restrictTo("admin"),
  classController.addScheduleToClass
);
// Admin replace schedule (overwrite)
router.put(
  "/:classId/schedule",
  requireAuth,
  restrictTo("admin"),
  classController.replaceClassSchedule
);


export default router;
