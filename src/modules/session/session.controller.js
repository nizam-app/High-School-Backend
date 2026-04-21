// import catchAsync from "../../utils/catchAsync.js";
// import sendResponse from "../../utils/sendResponse.js";
// import AppError from "../../utils/AppError.js";
// import * as sessionService from "./session.service.js";

// const buildScheduledAt = (date, time) => {
//   // date: "2026-02-10", time: "14:30"
//   const d = String(date || "").trim();
//   const t = String(time || "").trim();

//   if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
//   if (!/^\d{2}:\d{2}$/.test(t)) return null;

//   return new Date(`${d}T${t}:00.000Z`);
// };

// export const createSession = catchAsync(async (req, res) => {
//   const { classId, title, platform, meetingLink, date, time } = req.body;

//   if (!classId) throw new AppError("classId is required", 400);
//   if (!title) throw new AppError("Session title is required", 400);
//   if (!platform) throw new AppError("Platform is required", 400);
//   if (!meetingLink) throw new AppError("Meeting link is required", 400);
//   if (!date) throw new AppError("Date is required", 400);
//   if (!time) throw new AppError("Time is required", 400);

//   // simple link validation
//   if (!meetingLink.startsWith("http")) {
//     throw new AppError("Meeting link must be a valid URL", 400);
//   }

//   const scheduledAt = buildScheduledAt(date, time);
//   if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
//     throw new AppError("Invalid date/time format", 400);
//   }

//   const payload = {
//     classId,
//     teacherId: req.user._id, // from token
//     title,
//     platform: platform.toLowerCase(), // "zoom"
//     meetingLink,
//     scheduledAt,
//     status: "scheduled",
//   };

//   const session = await sessionService.createSession(payload);

//   return sendResponse(res, {
//     statusCode: 201,
//     message: "Session created successfully",
//     data: session,
//   });
// });
// export const getAllMyClassSessions = catchAsync(async (req, res) => {
//   const sessions = await sessionService.getAllMyClassSessions(req.user._id);

//   return sendResponse(res, {
//     statusCode: 200,
//     message: "All sessions fetched successfully",
//     data: sessions,
//   });
// });

// export const getSessionsByClass = catchAsync(async (req, res) => {
//   const sessions = await sessionService.getSessionsByClass(req.params.classId);

//   return sendResponse(res, {
//     statusCode: 200,
//     message: "Sessions fetched successfully",
//     data: sessions,
//   });
// });
// modules/session/session.controller.js
import SessionService from "./session.service.js";
import AttendanceService from "./services/attendance.service.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/AppError.js";
import User from "../user/user.model.js";

const norm = (value) => String(value || "").trim().toLowerCase();

const toSessionBuckets = (sessions = []) => {
  const activeNow = [];
  const upcoming = [];
  const completed = [];

  for (const session of sessions) {
    const status = norm(session?.status);
    if (status === "ongoing") {
      activeNow.push(session);
      continue;
    }
    if (status === "approved") {
      upcoming.push(session);
      continue;
    }
    if (status === "completed") {
      completed.push(session);
    }
  }

  return {
    activeNow: {
      totalOngoing: activeNow.length,
      sessions: activeNow,
    },
    upcoming: {
      totalApproved: upcoming.length,
      sessions: upcoming,
    },
    completed: {
      totalCompleted: completed.length,
      sessions: completed,
    },
  };
};

/**
 * Create session
 */
export const createSession = catchAsync(async (req, res) => {
  const teacherId = req.user._id;
  const sessionData = req.body;

  const session = await SessionService.createSession(sessionData, teacherId);

  res.status(201).json({
    success: true,
    message: "Session created and sent for admin approval",
    data: session,
  });
});

/**
 * Get teacher sessions
 */
export const getTeacherSessions = catchAsync(async (req, res) => {
  const teacherId = req.user._id;
  const filters = req.query;

  const sessions = await SessionService.getTeacherSessions(teacherId, filters);
  const buckets = toSessionBuckets(sessions);

  res.status(200).json({
    success: true,
    count: sessions.length,
    data: buckets,
  });
});

/**
 * Get student sessions
 */
export const getStudentSessions = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const filters = req.query;

  const sessions = await SessionService.getStudentSessions(studentId, filters);

  res.status(200).json({
    success: true,
    count: sessions.length,
    data: sessions,
  });
});

/**
 * Get pending sessions (admin)
 */
export const getPendingSessions = catchAsync(async (req, res) => {
  const sessions = await SessionService.getPendingSessions();

  res.status(200).json({
    success: true,
    count: sessions.length,
    data: sessions,
  });
});

/**
 * Get all sessions (admin)
 */
export const getAllSessions = catchAsync(async (req, res) => {
  const filters = req.query;
  const sessions = await SessionService.getAllSessions(filters);

  res.status(200).json({
    success: true,
    count: sessions.length,
    data: sessions,
  });
});

/**
 * Approve session
 */
export const approveSession = catchAsync(async (req, res) => {
  const sessionId = req.params.id;
  const adminId = req.user._id;

  const session = await SessionService.approveSession(sessionId, adminId);

  res.status(200).json({
    success: true,
    message: "Session approved successfully",
    data: session,
  });
});

/**
 * Reject session
 */
export const rejectSession = catchAsync(async (req, res) => {
  const sessionId = req.params.id;
  const adminId = req.user._id;
  const { reason } = req.body;

  if (!reason) {
    throw new AppError("Rejection reason is required", 400);
  }

  const session = await SessionService.rejectSession(sessionId, adminId, reason);

  res.status(200).json({
    success: true,
    message: "Session rejected",
    data: session,
  });
});

/**
 * Format joinedAt for display (Join Time column)
 */
const formatJoinTime = (joinedAt) => {
  if (!joinedAt) return null;
  const d = new Date(joinedAt);
  return d.toISOString().replace("T", " ").slice(0, 19);
};

/**
 * Get session by ID
 * Use GET /sessions/:id for Track modal: data.attendance has studentName, joinTime, participation.
 */
export const getSessionById = catchAsync(async (req, res) => {
  const sessionId = req.params.id;
  const userId = req.user._id;
  const userRole = req.user.role;

  const session = await SessionService.getSessionById(sessionId);

  // Authorization check
  if (userRole === "teacher" && session.teacher._id.toString() !== userId.toString()) {
    throw new AppError("You don't have permission to view this session", 403);
  }

  if (userRole === "student") {
    const student = req.user;
    const gradeMatch = [
      student.gradeLevel && session.grade && norm(student.gradeLevel) === norm(session.grade),
      student.gradeId && session.gradeId && String(student.gradeId) === String(session.gradeId),
    ].some(Boolean);
    const subjectMatch = [
      Array.isArray(student.assignedSubjects) &&
        student.assignedSubjects.map(norm).includes(norm(session.subject)),
      Array.isArray(student.assignedSubjectIds) &&
        student.assignedSubjectIds.some((id) => String(id) === String(session.subjectId)),
    ].some(Boolean);

    if (
      !gradeMatch ||
      !subjectMatch
    ) {
      throw new AppError("You don't have access to this session", 403);
    }
  }

  const sessionObj = session.toObject ? session.toObject() : session;
  const rawAttendance = Array.isArray(sessionObj.attendance) ? sessionObj.attendance : [];

  // Map existing attendance records by studentId for quick lookup
  const attendanceByStudentId = new Map();
  const normalizedAttendance = rawAttendance.map((a) => {
    const studentId = a.student?._id ?? a.student;
    const record = {
      _id: a._id,
      studentId,
      studentName: a.student?.name ?? null,
      status: a.status,
      joinedAt: a.joinedAt,
      joinTime: formatJoinTime(a.joinedAt),
      leftAt: a.leftAt,
      duration: a.duration ?? null,
      participation: a.duration != null ? `${a.duration} min` : null,
      markedBy: a.markedBy,
      markedAt: a.markedAt,
      notes: a.notes,
    };
    if (studentId) {
      attendanceByStudentId.set(String(studentId), record);
    }
    return record;
  });

  // Build roster: all students for this grade + subject
  const gradeConditions = [];
  if (sessionObj.gradeId) gradeConditions.push({ gradeId: sessionObj.gradeId });
  if (sessionObj.grade) gradeConditions.push({ gradeLevel: sessionObj.grade });

  const subjectConditions = [];
  if (sessionObj.subjectId) subjectConditions.push({ assignedSubjectIds: sessionObj.subjectId });
  if (sessionObj.subject) subjectConditions.push({ assignedSubjects: sessionObj.subject });

  const rosterFilter = [];
  if (gradeConditions.length) rosterFilter.push({ $or: gradeConditions });
  if (subjectConditions.length) rosterFilter.push({ $or: subjectConditions });

  let rosterStudents = [];
  if (rosterFilter.length) {
    const query =
      rosterFilter.length === 1
        ? { role: "student", ...rosterFilter[0] }
        : { role: "student", $and: rosterFilter };
    rosterStudents = await User.find(query).select("_id name").lean();
  }

  const seenStudentIds = new Set();
  const students = [];

  // First, build rows for all students in the roster (grade + subject)
  for (const stu of rosterStudents) {
    const sid = String(stu._id);
    seenStudentIds.add(sid);
    const record = attendanceByStudentId.get(sid);
    const status = record?.status || "absent";
    const duration = record?.duration ?? null;
    const participation =
      duration != null && sessionObj.duration
        ? Math.round(Math.min(100, (duration / sessionObj.duration) * 100))
        : null;

    students.push({
      studentId: stu._id,
      studentName: stu.name,
      status,
      joinTime: record?.joinTime ?? null,
      participation,
    });
  }

  // Then, include any attendance records for students not in the roster (fallback)
  for (const [sid, record] of attendanceByStudentId.entries()) {
    if (seenStudentIds.has(sid)) continue;
    const duration = record.duration ?? null;
    const participation =
      duration != null && sessionObj.duration
        ? Math.round(Math.min(100, (duration / sessionObj.duration) * 100))
        : null;

    students.push({
      studentId: record.studentId,
      studentName: record.studentName,
      status: record.status,
      joinTime: record.joinTime,
      participation,
    });
  }

  const totalStudents = students.length;
  const presentCount = students.filter(
    (s) => s.status === "present" || s.status === "late"
  ).length;
  const absentCount = totalStudents - presentCount;
  const attendanceRate = totalStudents
    ? Math.round((presentCount / totalStudents) * 100)
    : 0;

  // Keep normalized attendance on the session object as well
  sessionObj.attendance = normalizedAttendance;
  sessionObj.trackingSummary = {
    totalStudents,
    present: presentCount,
    absent: absentCount,
    attendanceRate,
  };
  sessionObj.students = students;

  res.status(200).json({
    success: true,
    data: sessionObj,
  });
});

/**
 * Join session (student)
 */
export const joinSession = catchAsync(async (req, res) => {
  const sessionId = req.params.id;
  const userId = req.user._id;
  const userRole = req.user.role;

  const { session, attendance } =
    userRole === "student"
      ? await AttendanceService.joinLiveAttendance({ sessionId, studentId: userId })
      : await SessionService.joinSessionAsUser(sessionId, userId, userRole);

  res.status(200).json({
    success: true,
    message: "Successfully joined session",
    data: { session, attendance },
  });
});

/**
 * Attendance join endpoint.
 * Accepts sessionId/studentId in body, but defaults studentId to the authenticated student.
 */
export const joinAttendance = catchAsync(async (req, res) => {
  const sessionId = req.body?.sessionId;
  const studentId = req.body?.studentId || req.user?._id;

  const data = await AttendanceService.joinLiveAttendance({ sessionId, studentId });

  res.status(200).json({
    success: true,
    message: "Attendance marked on join",
    data,
  });
});

/**
 * Attendance leave endpoint.
 * Accepts sessionId/studentId in body, but defaults studentId to the authenticated student.
 */
export const leaveAttendance = catchAsync(async (req, res) => {
  const sessionId = req.body?.sessionId;
  const studentId = req.body?.studentId || req.user?._id;

  const data = await AttendanceService.leaveLiveAttendance({ sessionId, studentId });

  res.status(200).json({
    success: true,
    message: "Attendance updated on leave",
    data,
  });
});

export const startSession = catchAsync(async (req, res) => {
  const sessionId = req.params.id;
  const teacherId = req.user._id;

  const session = await SessionService.startSession(sessionId, teacherId);

  res.status(200).json({
    success: true,
    message: "Session started successfully",
    data: session,
  });
});

/**
 * Mark attendance
 */
export const markAttendance = catchAsync(async (req, res) => {
  const { sessionId, studentId } = req.params;
  const { status } = req.body;
  const markedById = req.user._id;

  if (!["present", "absent", "late"].includes(status)) {
    throw new AppError("Invalid attendance status", 400);
  }

  const attendance = await SessionService.markAttendance(
    sessionId,
    studentId,
    status,
    markedById,
    req.user.role
  );

  res.status(200).json({
    success: true,
    message: "Attendance marked successfully",
    data: attendance,
  });
});

/**
 * Complete session
 */
export const completeSession = catchAsync(async (req, res) => {
  const sessionId = req.params.id;
  const teacherId = req.user._id;
  const { notes, recordingUrl } = req.body;

  const session = await SessionService.completeSession(sessionId, teacherId);

  if (notes) session.notes = notes;
  if (recordingUrl) session.recordingUrl = recordingUrl;

  await session.save();

  res.status(200).json({
    success: true,
    message: "Session completed successfully",
    data: session,
  });
});

/**
 * Update session
 */
export const updateSession = catchAsync(async (req, res) => {
  const sessionId = req.params.id;
  const teacherId = req.user._id;
  const updateData = req.body;

  const session = await SessionService.updateSession(sessionId, teacherId, updateData);

  res.status(200).json({
    success: true,
    message: "Session updated successfully",
    data: session,
  });
});

/**
 * Cancel session
 */
export const cancelSession = catchAsync(async (req, res) => {
  const sessionId = req.params.id;
  const userId = req.user._id;
  const userRole = req.user.role;

  const session = await SessionService.cancelSession(sessionId, userId, userRole);

  res.status(200).json({
    success: true,
    message: "Session cancelled successfully",
    data: session,
  });
});
