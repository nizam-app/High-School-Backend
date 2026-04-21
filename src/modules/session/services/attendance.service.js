import mongoose from "mongoose";
import Session from "../session.model.js";
import User from "../../user/user.model.js";
import ClassModel from "../../class/class.model.js";
import AppError from "../../../utils/AppError.js";

const ATTENDANCE_JOIN_GRACE_MINUTES = 10;
const MIN_PRESENT_DURATION_MINUTES = 5;

const norm = (value) => String(value || "").trim().toLowerCase();

const toObjectId = (value, fieldName = "id") => {
  const id = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
  return new mongoose.Types.ObjectId(id);
};

const getScheduledStart = (session) => {
  const start = session?.startedAt ? new Date(session.startedAt) : new Date(session?.date);
  if (!start || Number.isNaN(start.getTime())) {
    throw new AppError("Session start time is invalid", 400);
  }

  if (!session?.startedAt && session?.time) {
    const [hours, minutes] = String(session.time).split(":").map(Number);
    start.setHours(hours || 0, minutes || 0, 0, 0);
  }

  return start;
};

const getDurationMinutes = (joinedAt, leftAt) => {
  if (!joinedAt || !leftAt) return 0;
  const diff = Math.round((new Date(leftAt) - new Date(joinedAt)) / 60000);
  return Math.max(diff, 0);
};

const canStudentAccessSession = (student, session) => {
  const gradeMatch = [
    student?.gradeLevel && session?.grade && norm(student.gradeLevel) === norm(session.grade),
    student?.gradeId && session?.gradeId && String(student.gradeId) === String(session.gradeId),
  ].some(Boolean);

  const subjectMatch = [
    Array.isArray(student?.assignedSubjects) &&
      student.assignedSubjects.map(norm).includes(norm(session?.subject)),
    Array.isArray(student?.assignedSubjectIds) &&
      student.assignedSubjectIds.some((id) => String(id) === String(session?.subjectId)),
  ].some(Boolean);

  return gradeMatch && subjectMatch;
};

const buildRosterQuery = (session) => {
  const andFilters = [{ role: "student" }];

  const gradeFilters = [];
  if (session?.gradeId) gradeFilters.push({ gradeId: session.gradeId });
  if (session?.grade) gradeFilters.push({ gradeLevel: session.grade });
  if (gradeFilters.length === 1) andFilters.push(gradeFilters[0]);
  if (gradeFilters.length > 1) andFilters.push({ $or: gradeFilters });

  const subjectFilters = [];
  if (session?.subjectId) subjectFilters.push({ assignedSubjectIds: session.subjectId });
  if (session?.subject) subjectFilters.push({ assignedSubjects: session.subject });
  if (subjectFilters.length === 1) andFilters.push(subjectFilters[0]);
  if (subjectFilters.length > 1) andFilters.push({ $or: subjectFilters });

  return andFilters.length === 1 ? andFilters[0] : { $and: andFilters };
};

class AttendanceService {
  async getSessionOrThrow(sessionId) {
    const session = await Session.findById(toObjectId(sessionId, "sessionId"));
    if (!session) throw new AppError("Session not found", 404);
    return session;
  }

  async getStudentOrThrow(studentId) {
    const student = await User.findById(toObjectId(studentId, "studentId")).select(
      "role gradeLevel gradeId assignedSubjects assignedSubjectIds name"
    );
    if (!student || student.role !== "student") {
      throw new AppError("Invalid student", 404);
    }
    return student;
  }

  async getSessionStudents(session) {
    // Prefer explicit class roster when the session is attached to a class.
    if (session?.classId) {
      const classDoc = await ClassModel.findById(session.classId).select("students").lean();
      if (classDoc?.students?.length) {
        return classDoc.students.map((studentId) => String(studentId));
      }
    }

    // Fallback: infer roster from session grade + subject.
    const students = await User.find(buildRosterQuery(session)).select("_id").lean();
    return students.map((student) => String(student._id));
  }

  async joinLiveAttendance({ sessionId, studentId }) {
    const [session, student] = await Promise.all([
      this.getSessionOrThrow(sessionId),
      this.getStudentOrThrow(studentId),
    ]);

    if (session.status !== "ongoing") {
      throw new AppError("Session is not available for joining", 400);
    }

    if (!canStudentAccessSession(student, session)) {
      throw new AppError("You don't have access to this session", 403);
    }

    const now = new Date();
    const sessionStart = getScheduledStart(session);
    const joinedLate = now.getTime() - sessionStart.getTime() > ATTENDANCE_JOIN_GRACE_MINUTES * 60000;
    const nextStatus = joinedLate ? "late" : "present";

    const attendanceIndex = session.attendance.findIndex(
      (record) => String(record.student) === String(student._id)
    );

    // Prevent duplicate joins when the student is already in the room.
    if (
      attendanceIndex >= 0 &&
      session.attendance[attendanceIndex]?.joinedAt &&
      !session.attendance[attendanceIndex]?.leftAt
    ) {
      throw new AppError("Student has already joined this session", 409);
    }

    if (attendanceIndex >= 0) {
      session.attendance[attendanceIndex].status = nextStatus;
      session.attendance[attendanceIndex].joinedAt = now;
      session.attendance[attendanceIndex].leftAt = null;
      session.attendance[attendanceIndex].duration = 0;
    } else {
      session.attendance.push({
        student: student._id,
        status: nextStatus,
        joinedAt: now,
        leftAt: null,
        duration: 0,
      });
    }

    await session.save();

    const attendance =
      attendanceIndex >= 0
        ? session.attendance[attendanceIndex]
        : session.attendance[session.attendance.length - 1];

    return { session, attendance };
  }

  async leaveLiveAttendance({ sessionId, studentId }) {
    const [session, student] = await Promise.all([
      this.getSessionOrThrow(sessionId),
      this.getStudentOrThrow(studentId),
    ]);

    const attendanceIndex = session.attendance.findIndex(
      (record) => String(record.student) === String(student._id)
    );

    if (attendanceIndex === -1) {
      throw new AppError("Student has not joined this session", 400);
    }

    const attendance = session.attendance[attendanceIndex];
    if (!attendance.joinedAt) {
      throw new AppError("Student has not joined this session", 400);
    }
    if (attendance.leftAt) {
      throw new AppError("Student has already left this session", 409);
    }

    const now = new Date();
    attendance.leftAt = now;
    attendance.duration = getDurationMinutes(attendance.joinedAt, now);

    await session.save();

    return { session, attendance };
  }

  async finalizeLiveSessionAttendance({ sessionId, sessionDoc = null, endedAt = null }) {
    const session = sessionDoc || (await this.getSessionOrThrow(sessionId));
    const finalizedAt = endedAt ? new Date(endedAt) : session.endedAt ? new Date(session.endedAt) : new Date();

    const rosterStudentIds = await this.getSessionStudents(session);
    const attendanceByStudentId = new Map();

    // Normalize existing attendance records and auto-close any open joins.
    for (const record of session.attendance) {
      if (record.joinedAt && !record.leftAt) {
        record.leftAt = finalizedAt;
      }

      record.duration = getDurationMinutes(record.joinedAt, record.leftAt);

      if (record.duration < MIN_PRESENT_DURATION_MINUTES) {
        record.status = "absent";
      }

      attendanceByStudentId.set(String(record.student), record);
    }

    // Any enrolled student who never joined is absent.
    for (const studentId of rosterStudentIds) {
      if (attendanceByStudentId.has(String(studentId))) continue;

      session.attendance.push({
        student: studentId,
        status: "absent",
        joinedAt: null,
        leftAt: null,
        duration: 0,
      });
    }

    await session.save();
    return session;
  }

  // Optional Socket.io example:
  // io.on("connection", (socket) => {
  //   socket.on("live-session:join", async ({ sessionId, studentId }) => {
  //     const result = await attendanceService.joinLiveAttendance({ sessionId, studentId });
  //     io.to(sessionId).emit("live-session:attendance-updated", result.attendance);
  //   });
  //
  //   socket.on("live-session:leave", async ({ sessionId, studentId }) => {
  //     const result = await attendanceService.leaveLiveAttendance({ sessionId, studentId });
  //     io.to(sessionId).emit("live-session:attendance-updated", result.attendance);
  //   });
  // });
}

export default new AttendanceService();
