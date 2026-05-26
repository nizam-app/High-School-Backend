import { Router } from "express";
import userRouter from "../modules/user/user.router.js";
import authRouter from "../modules/auth/auth.router.js";
import lessonRouter from "../modules/lessons/lesson.router.js";
import assignmentRouter from "../modules/assignment/assignment.router.js";
import sessionRouter from "../modules/session/session.router.js";
import classsRouter from "../modules/class/classs.router.js";
import submissionRouter from "../modules/submisssion/submission.router.js";
import profileRouter from "../modules/Profile/profile.router.js";
import subjectRouter from "../modules/subject/subject.router.js";
import gradeRouter from "../modules/grade/grade.router.js";
import studentRouter from "../modules/students/student.router.js";
import adminRouter from "../modules/admin/admin.router.js";
import teacherRouter from "../modules/Teacher/teacher.router.js";
import attendanceRouter from "../modules/attendance/attendance.router.js";
// OTP flow disabled
// import otpRouter from "../modules/otp/otp.router.js";
import smsRouter from "../modules/sms/sms.router.js";
import notificationRouter from "../modules/notification/notification.router.js";




const router = Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    grades: "database-driven",
  });
});

router.use("/auth", authRouter);
router.use("/users", userRouter);
router.use("/lesson", lessonRouter);
router.use("/assignments", assignmentRouter);
router.use("/sessions", sessionRouter);
router.use('/classes', classsRouter)
router.use('/submission', submissionRouter)
router.use('/submissions', submissionRouter) // plural alias (REST convention)
router.use("/profiles", profileRouter);
router.use("/subjects", subjectRouter);
router.use("/grades", gradeRouter);
router.use("/students", studentRouter);
router.use("/teachers", teacherRouter);
router.use("/attendance", attendanceRouter);
router.use("/admin", adminRouter);
// router.use("/otp", otpRouter);
router.use("/sms", smsRouter);
router.use("/notifications", notificationRouter);





export default router;
