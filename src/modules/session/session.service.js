
import Session from "./session.model.js";
import User from "../user/user.model.js";
import AppError from "../../utils/AppError.js";
import { resolveGradeRef, resolveSubjectRef } from "../../utils/educationRefs.js";
import { TimetableSlot } from "../timetable/timetableSlot.model.js";
import ClassModel from "../class/class.model.js";
import AttendanceService from "./services/attendance.service.js";

const norm = (value) => String(value || "").trim().toLowerCase();
const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const minutesToTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const getNextDateForDay = (day) => {
  const target = DAY_ORDER.indexOf(String(day || "").trim().toLowerCase());
  if (target === -1) throw new AppError("Invalid timetable day", 400);

  const now = new Date();
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);

  const diff = (target - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + diff);
  return next;
};

const normalizeDateOnly = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new AppError("A valid date is required", 400);
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const assertDateMatchesDay = (date, day) => {
  const actualDay = DAY_ORDER[date.getDay()];
  if (actualDay !== String(day || "").trim().toLowerCase()) {
    throw new AppError("Provided date does not match the timetable day", 400);
  }
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

class SessionService {
  async resolveSessionCreationInput(sessionData, teacherId) {
    if (!sessionData?.timetableSlotId) {
      const gradeRef = await resolveGradeRef({
        gradeId: sessionData?.gradeId,
        gradeLevel: sessionData?.grade,
        required: true,
      });
      const subjectRef = await resolveSubjectRef({
        subjectId: sessionData?.subjectId,
        subject: sessionData?.subject,
        required: true,
      });

      return {
        title: sessionData?.title,
        className: sessionData?.className,
        classId: sessionData?.classId || null,
        date: sessionData?.date,
        time: sessionData?.time,
        duration: sessionData?.duration,
        zoomLink: sessionData?.zoomLink,
        gradeRef,
        subjectRef,
      };
    }

    const slot = await TimetableSlot.findById(sessionData.timetableSlotId).lean();
    if (!slot || !slot.isActive) {
      throw new AppError("Timetable slot not found", 404);
    }
    if (String(slot.teacher) !== String(teacherId)) {
      throw new AppError("You don't have permission to create a session from this timetable slot", 403);
    }

    const classDoc = slot.classRef ? await ClassModel.findById(slot.classRef).lean() : null;
    const date = sessionData?.date ? normalizeDateOnly(sessionData.date) : getNextDateForDay(slot.day);
    assertDateMatchesDay(date, slot.day);

    const gradeRef = await resolveGradeRef({
      gradeId: classDoc?.gradeId || sessionData?.gradeId,
      gradeLevel: classDoc?.gradeLevel || slot.grade,
      required: true,
    });
    const subjectRef = await resolveSubjectRef({
      subjectId: classDoc?.subjectId || sessionData?.subjectId,
      subject: classDoc?.subject || slot.subject,
      required: true,
    });

    return {
      title:
        sessionData?.title ||
        `${subjectRef.subject} Live Session`,
      className: sessionData?.className || classDoc?.className || "",
      classId: classDoc?._id || null,
      date,
      time: sessionData?.time || minutesToTime(slot.startMin),
      duration: sessionData?.duration || Math.max(15, slot.endMin - slot.startMin),
      zoomLink: sessionData?.zoomLink,
      gradeRef,
      subjectRef,
    };
  }

  /**
   * Create a new session
   */
  async createSession(sessionData, teacherId) {
    const { title, className, classId, date, time, zoomLink, duration, gradeRef, subjectRef } =
      await this.resolveSessionCreationInput(sessionData, teacherId);
    const grade = gradeRef.gradeLevel;
    const subject = subjectRef.subject;

    // Verify teacher
    const teacher = await User.findById(teacherId);

    if (!teacher || teacher.role !== "teacher") {
      throw new AppError("Invalid teacher", 400);
    }

    const gradeAllowed =
      teacher.assignedGrades.includes(grade) ||
      (gradeRef.gradeId
        ? (teacher.assignedGradeIds || []).some(
            (id) => String(id) === String(gradeRef.gradeId)
          )
        : false);
    if (!gradeAllowed) {
      throw new AppError(`You are not assigned to teach ${grade} grade`, 403);
    }

    const subjectAllowed =
      teacher.subject === subject ||
      (subjectRef.subjectId && teacher.subjectId
        ? String(teacher.subjectId) === String(subjectRef.subjectId)
        : false);
    if (!subjectAllowed) {
      throw new AppError(`You are not assigned to teach ${subject}`, 403);
    }

    const resolvedClassName = className;

    // Extract meeting ID from Zoom link
    const meetingId = this.extractMeetingId(zoomLink);

    // Create session
    const session = await Session.create({
      title,
      classId: classId || null,
      grade,
      gradeId: gradeRef.gradeId || null,
      subject,
      subjectId: subjectRef.subjectId || null,
      className: resolvedClassName,
      date,
      time,
      duration: duration || 60,
      zoomLink,
      meetingId,
      teacher: teacherId,
      status: "pending",
    });

    await session.populate("teacher", "name subject assignedGrades");

    return session;
  }

  async startSession(sessionId, teacherId) {
    const session = await Session.findOne({
      _id: sessionId,
      teacher: teacherId,
    });

    if (!session) {
      throw new AppError("Session not found or you don't have permission", 404);
    }

    if (session.status !== "approved") {
      throw new AppError(`Cannot start session with status: ${session.status}`, 400);
    }

    session.status = "ongoing";
    session.startedAt = new Date();
    session.endedAt = null;

    await session.save();
    return session;
  }

  /**
   * Get sessions by teacher
   */
  async getTeacherSessions(teacherId, filters = {}) {
    const query = { teacher: teacherId };

    if (filters.status) query.status = filters.status;
    if (filters.grade) query.grade = filters.grade;
    if (filters.subject) query.subject = filters.subject;
    if (filters.date) {
      const startDate = new Date(filters.date);
      const endDate = new Date(filters.date);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }

    const sessions = await Session.find(query)
      .select("-attachments")
      .populate("teacher", "name")
      .populate("approvalStatus.approvedBy approvalStatus.rejectedBy", "name")
      .sort({ date: 1, time: 1 });

    return sessions;
  }

  /**
   * Get sessions for students
   */
  async getStudentSessions(studentId, filters = {}) {
    const student = await User.findById(studentId);
    if (!student || student.role !== "student") {
      throw new AppError("Student not found", 404);
    }

    const gradeFilters = [];
    if (student.gradeLevel) gradeFilters.push({ grade: student.gradeLevel });
    if (student.gradeId) gradeFilters.push({ gradeId: student.gradeId });

    const subjectFilters = [];
    const subjects = Array.isArray(student.assignedSubjects) ? student.assignedSubjects : [];
    const subjectIds = Array.isArray(student.assignedSubjectIds) ? student.assignedSubjectIds : [];
    if (subjects.length) subjectFilters.push({ subject: { $in: subjects } });
    if (subjectIds.length) subjectFilters.push({ subjectId: { $in: subjectIds } });

    const query = {
      status: { $in: ["approved", "ongoing", "completed"] },
    };
    if (gradeFilters.length) query.$and = [gradeFilters.length > 1 ? { $or: gradeFilters } : gradeFilters[0]];
    if (subjectFilters.length) {
      if (!query.$and) query.$and = [];
      query.$and.push(subjectFilters.length > 1 ? { $or: subjectFilters } : subjectFilters[0]);
    }

    if (filters.status) query.status = filters.status;
    if (filters.subject) query.subject = filters.subject;
    if (filters.date) {
      const startDate = new Date(filters.date);
      const endDate = new Date(filters.date);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }

    const sessions = await Session.find(query)
      .select("-attachments")
      .populate("teacher", "name")
      .sort({ date: 1, time: 1 });

    // Add student's attendance status
    const sessionsWithAttendance = sessions.map((session) => {
      const attendance = session.attendance?.find(
        (a) => a.student.toString() === studentId.toString()
      );

      return {
        ...session.toObject(),
        myAttendance: attendance?.status || "absent",
        hasJoined: !!attendance?.joinedAt,
      };
    });

    return sessionsWithAttendance;
  }

  /**
   * Get all pending sessions (admin)
   */
  async getPendingSessions() {
    const sessions = await Session.find({ status: "pending" })
      .select("-attachments")
      .populate("teacher", "name phone")
      .sort({ createdAt: -1 });

    return sessions;
  }

  /**
   * Get all sessions (admin)
   */
  async getAllSessions(filters = {}) {
    const query = {};

    if (filters.status) query.status = filters.status;
    if (filters.grade) query.grade = filters.grade;
    if (filters.subject) query.subject = filters.subject;
    if (filters.teacher) query.teacher = filters.teacher;
    if (filters.date) {
      const startDate = new Date(filters.date);
      const endDate = new Date(filters.date);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }

    const sessions = await Session.find(query)
      .select("-attachments")
      .populate("teacher", "name")
      .populate("approvalStatus.approvedBy approvalStatus.rejectedBy", "name")
      .sort({ date: 1, time: 1 });

    return sessions;
  }

  /**
   * Approve session
   */
  async approveSession(sessionId, adminId) {
    const session = await Session.findById(sessionId);

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    if (session.status !== "pending") {
      throw new AppError(`Cannot approve session with status: ${session.status}`, 400);
    }

    session.status = "approved";
    session.approvalStatus.approvedBy = adminId;
    session.approvalStatus.approvedAt = new Date();

    await session.save();

    return session;
  }

  /**
   * Reject session
   */
  async rejectSession(sessionId, adminId, reason) {
    const session = await Session.findById(sessionId);

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    if (session.status !== "pending") {
      throw new AppError(`Cannot reject session with status: ${session.status}`, 400);
    }

    session.status = "rejected";
    session.approvalStatus.rejectedBy = adminId;
    session.approvalStatus.rejectedAt = new Date();
    session.approvalStatus.rejectionReason = reason;

    await session.save();

    return session;
  }

  /**
   * Mark attendance
   */
  async markAttendance(sessionId, studentId, status, markedById, actorRole) {
    const session = await Session.findById(sessionId);

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    if (actorRole === "teacher" && String(session.teacher) !== String(markedById)) {
      throw new AppError("You don't have permission to mark attendance for this session", 403);
    }

    let attendanceIndex = session.attendance.findIndex(
      (a) => a.student.toString() === studentId.toString()
    );

    if (attendanceIndex === -1) {
      session.attendance.push({
        student: studentId,
        status: status,
        markedBy: markedById,
        markedAt: new Date(),
        joinedAt: status === "present" || status === "late" ? new Date() : null,
      });
      attendanceIndex = session.attendance.length - 1;
    } else {
      session.attendance[attendanceIndex].status = status;
      session.attendance[attendanceIndex].markedBy = markedById;
      session.attendance[attendanceIndex].markedAt = new Date();

      if (status === "present" || status === "late") {
        session.attendance[attendanceIndex].joinedAt = new Date();
      }
    }

    await session.save();

    const record = session.attendance[attendanceIndex];
    const student = await User.findById(studentId).select("name").lean();
    return {
      _id: record._id,
      student: {
        id: record.student,
        name: student?.name ?? null,
      },
      status: record.status,
      joinedAt: record.joinedAt,
      leftAt: record.leftAt,
      duration: record.duration,
      markedBy: record.markedBy,
      markedAt: record.markedAt,
      notes: record.notes,
    };
  }

  /**
   * Student joins session
   */
  async studentJoinSession(sessionId, studentId) {
    const [session, student] = await Promise.all([
      Session.findById(sessionId),
      User.findById(studentId).select("role gradeLevel gradeId assignedSubjects assignedSubjectIds"),
    ]);

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    if (!student || student.role !== "student") {
      throw new AppError("Student not found", 404);
    }

    if (session.status !== "ongoing") {
      throw new AppError("Session is not available", 400);
    }

    if (!canStudentAccessSession(student, session)) {
      throw new AppError("You don't have access to this session", 403);
    }

    let attendanceIndex = session.attendance.findIndex(
      (a) => a.student.toString() === studentId.toString()
    );

    // Calculate if late
    const sessionDateTime = new Date(session.date);
    const [hours, minutes] = session.time.split(":").map(Number);
    sessionDateTime.setHours(hours, minutes, 0, 0);

    const now = new Date();
    const isLate = now > new Date(sessionDateTime.getTime() + 10 * 60000);

    if (attendanceIndex === -1) {
      session.attendance.push({
        student: studentId,
        status: isLate ? "late" : "present",
        joinedAt: now,
      });
      attendanceIndex = session.attendance.length - 1;
    } else {
      session.attendance[attendanceIndex].status = isLate ? "late" : "present";
      session.attendance[attendanceIndex].joinedAt = now;
    }

    await session.save();

    return { session, attendance: session.attendance[attendanceIndex] };
  }

  async adminJoinSession(sessionId, adminId) {
    const [session, admin] = await Promise.all([
      Session.findById(sessionId),
      User.findById(adminId).select("role"),
    ]);

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    if (!admin || admin.role !== "admin") {
      throw new AppError("Admin not found", 404);
    }

    if (session.status !== "ongoing") {
      throw new AppError("Session is not available", 400);
    }

    return { session, attendance: null };
  }

  async joinSessionAsUser(sessionId, userId, userRole) {
    if (userRole === "admin") {
      return this.adminJoinSession(sessionId, userId);
    }

    if (userRole === "student") {
      return this.studentJoinSession(sessionId, userId);
    }

    throw new AppError("You don't have permission to join this session", 403);
  }

  /**
   * Complete session
   */
  async completeSession(sessionId, teacherId) {
    const session = await Session.findOne({
      _id: sessionId,
      teacher: teacherId,
    });

    if (!session) {
      throw new AppError("Session not found or you don't have permission", 404);
    }

    if (session.status !== "ongoing") {
      throw new AppError(`Cannot complete session with status: ${session.status}`, 400);
    }

    session.status = "completed";
    session.endedAt = new Date();
    await AttendanceService.finalizeLiveSessionAttendance({
      sessionDoc: session,
      endedAt: session.endedAt,
    });

    return session;
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId) {
    const session = await Session.findById(sessionId)
      .select("-attachments")
      .populate("teacher", "name phone")
      .populate("attendance.student", "name")
      .populate("approvalStatus.approvedBy approvalStatus.rejectedBy", "name");

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    return session;
  }

  /**
   * Update session
   */
  async updateSession(sessionId, teacherId, updateData) {
    const session = await Session.findOne({
      _id: sessionId,
      teacher: teacherId,
    });

    if (!session) {
      throw new AppError("Session not found or you don't have permission", 404);
    }

    if (!["pending", "rejected"].includes(session.status)) {
      throw new AppError(`Cannot update session with status: ${session.status}`, 400);
    }

    const allowedUpdates = ["title", "date", "time", "duration", "zoomLink", "className"];

    allowedUpdates.forEach((field) => {
      if (updateData[field] !== undefined) {
        session[field] = updateData[field];
      }
    });

    if (session.status === "rejected") {
      session.status = "pending";
      session.approvalStatus = {};
    }

    await session.save();

    return session;
  }

  /**
   * Cancel session
   */
  async cancelSession(sessionId, userId, userRole) {
    const query = { _id: sessionId };

    if (userRole === "teacher") {
      query.teacher = userId;
    }

    const session = await Session.findOne(query);

    if (!session) {
      throw new AppError("Session not found or you don't have permission", 404);
    }

    if (["ongoing", "completed"].includes(session.status)) {
      throw new AppError(`Cannot cancel ${session.status} session`, 400);
    }

    session.status = "cancelled";
    await session.save();

    return session;
  }

  /**
   * Helper: Extract meeting ID
   */
  extractMeetingId(zoomLink) {
    if (typeof zoomLink !== "string") return null;
    const match = zoomLink.match(/\/j\/(\d+)/);
    return match ? match[1] : null;
  }
}

export default new SessionService();
