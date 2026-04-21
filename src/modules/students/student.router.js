import express from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import * as studentController from "./student.controller.js";

const router = express.Router();

router.get("/student/classes", requireAuth, restrictTo("student"), studentController.myClasses);
router.get("/progress/overview", requireAuth, restrictTo("student"), studentController.progressOverview);
router.get("/dashboard", requireAuth, restrictTo("student"), studentController.dashboard);
router.get("/timetable", requireAuth, restrictTo("student"), studentController.timetable);

export default router;
