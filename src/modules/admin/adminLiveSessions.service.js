import AppError from "../../utils/AppError.js";
import Session from "../session/session.model.js";
import User from "../user/user.model.js";
import SessionService from "../session/session.service.js";
import { resolveGradeRef, resolveSubjectRef } from "../../utils/educationRefs.js";

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
};

const normalizeTab = (tab) => {
  const v = String(tab || "all").trim().toLowerCase();
  if (["all", "today", "pending", "live"].includes(v)) return v;
  throw new AppError("Invalid tab. Use all|today|pending|live", 400);
};

const ensureTeacherCanTeach = async ({ teacherId, gradeRef, subjectRef }) => {
  const teacher = await User.findById(teacherId).lean();
  if (!teacher || teacher.role !== "teacher") {
    throw new AppError("Invalid teacherId", 400);
  }

  const gradeOk =
    (teacher.assignedGrades || []).includes(gradeRef.gradeLevel) ||
    (gradeRef.gradeId
      ? (teacher.assignedGradeIds || []).some((id) => String(id) === String(gradeRef.gradeId))
      : false);
  if (!gradeOk) {
    throw new AppError(`Teacher is not assigned to grade "${gradeRef.gradeLevel}"`, 400);
  }

  const subjectOk =
    String(teacher.subject || "").trim() === String(subjectRef.subject || "").trim() ||
    (teacher.subjectId && subjectRef.subjectId
      ? String(teacher.subjectId) === String(subjectRef.subjectId)
      : false);
  if (!subjectOk) {
    throw new AppError(`Teacher is not assigned to subject "${subjectRef.subject}"`, 400);
  }

  return teacher;
};

/**
 * Count students assigned to the same grade and subject as the session
 * (students who are eligible to attend this live session)
 */
const countStudentsForGradeAndSubject = async ({ gradeId, grade, subjectId, subject }) => {
  const gradeCondition =
    gradeId && String(gradeId).length === 24
      ? { $or: [{ gradeId }, { gradeLevel: grade || "" }] }
      : { gradeLevel: grade || "" };
  const subjectCondition =
    subjectId && String(subjectId).length === 24
      ? { $or: [{ assignedSubjectIds: subjectId }, { assignedSubjects: subject || "" }] }
      : { assignedSubjects: subject || "" };

  return User.countDocuments({
    role: "student",
    $and: [gradeCondition, subjectCondition],
  });
};

export const listAdminLiveSessions = async (query = {}) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 20), 100);
  const skip = (page - 1) * limit;
  const tab = normalizeTab(query.tab);

  const filter = {};
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (tab === "today") filter.date = { $gte: todayStart, $lt: todayEnd };
  if (tab === "pending") filter.status = "pending";
  if (tab === "live") filter.status = "ongoing";

  if (query.teacherId) filter.teacher = query.teacherId;
  if (query.status && tab === "all") filter.status = String(query.status).trim().toLowerCase();

  const [total, sessions] = await Promise.all([
    Session.countDocuments(filter),
    Session.find(filter)
      .sort({ date: 1, time: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("teacher", "name phone")
      .lean(),
  ]);

  // Unique (gradeId, grade, subjectId, subject) for this page to avoid duplicate counts
  const key = (s) =>
    `${s.gradeId || ""}|${s.grade || ""}|${s.subjectId || ""}|${(s.subject || "").trim()}`;
  const seen = new Set();
  const keys = [];
  for (const s of sessions) {
    const k = key(s);
    if (!seen.has(k)) {
      seen.add(k);
      keys.push({ gradeId: s.gradeId, grade: s.grade, subjectId: s.subjectId, subject: s.subject });
    }
  }

  const countByKey = await Promise.all(
    keys.map((k) => countStudentsForGradeAndSubject(k))
  ).then((counts) => {
    const m = new Map();
    keys.forEach((k, i) => m.set(key(k), counts[i]));
    return m;
  });

  const data = sessions.map((s) => {
    const totalAttendance = Array.isArray(s.attendance) ? s.attendance.length : 0;
    const joinedCount = Array.isArray(s.attendance)
      ? s.attendance.filter((a) => a.joinedAt).length
      : 0;
    const totalStudents = countByKey.get(key(s)) ?? 0;
    const attendanceRate =
      totalStudents > 0
        ? Math.round((joinedCount / totalStudents) * 100)
        : totalAttendance > 0
          ? Math.round((joinedCount / totalAttendance) * 100)
          : 0;

    return {
      id: s._id,
      title: s.title,
      teacher: s.teacher
        ? { id: s.teacher._id, name: s.teacher.name, phone: s.teacher.phone || null }
        : null,
      grade: s.grade,
      gradeId: s.gradeId || null,
      subject: s.subject,
      subjectId: s.subjectId || null,
      className: s.className || null,
      date: s.date,
      time: s.time,
      duration: s.duration,
      zoomLink: s.zoomLink,
      status: s.status,
      pendingApproval: s.status === "pending",
      totalStudents,
      attendanceRate,
      joinedCount,
      totalAttendance,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  });

  return {
    data,
    meta: {
      tab,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const getAdminLiveSessionsStats = async () => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [todaySessions, liveNow, pendingApproval, attendanceAgg] = await Promise.all([
    Session.countDocuments({ date: { $gte: todayStart, $lt: todayEnd } }),
    Session.countDocuments({ status: "ongoing" }),
    Session.countDocuments({ status: "pending" }),
    Session.aggregate([
      { $match: { status: { $in: ["ongoing", "completed"] } } },
      { $unwind: { path: "$attendance", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [{ $ifNull: ["$attendance.student", false] }, 1, 0],
            },
          },
          present: {
            $sum: {
              $cond: [
                { $in: ["$attendance.status", ["present", "late"]] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const total = attendanceAgg?.[0]?.total || 0;
  const present = attendanceAgg?.[0]?.present || 0;
  const avgAttendance = total ? Math.round((present / total) * 100) : 0;

  return {
    todaysSessions: todaySessions,
    liveNow,
    pendingApproval,
    avgAttendance,
  };
};

export const createAdminLiveSession = async ({ payload }) => {
  const {
    title,
    subject,
    grade,
    className,
    teacherId,
    meetingLink,
    duration,
    date,
    time,
  } = payload || {};

  if (!teacherId) throw new AppError("teacherId is required", 400);
  if (!title) throw new AppError("title is required", 400);
  if (!subject) throw new AppError("subject is required", 400);
  if (!grade) throw new AppError("grade is required", 400);
  if (!meetingLink) throw new AppError("meetingLink is required", 400);
  if (!date) throw new AppError("date is required", 400);
  if (!time) throw new AppError("time is required", 400);

  // Normalize time: expect HH:mm, but extract safely
  const timeMatch =
    typeof time === "string"
      ? time.match(/\d{1,2}:\d{2}/)
      : null;
  if (!timeMatch) {
    throw new AppError("time must be in HH:mm format", 400);
  }

  const normalizedDuration = Number.parseInt(String(duration ?? "60"), 10) || 60;

  const normalizedPayload = {
    title,
    subject,
    grade,
    className: className || "",
    teacherId,
    date,
    time: timeMatch[0],
    duration: normalizedDuration,
    zoomLink: meetingLink,
  };

  return SessionService.createSession(normalizedPayload, teacherId);
};

export const updateAdminLiveSession = async ({ sessionId, payload }) => {
  const session = await Session.findById(sessionId);
  if (!session) throw new AppError("Session not found", 404);
  if (["completed", "cancelled"].includes(session.status)) {
    throw new AppError(`Cannot update ${session.status} session`, 400);
  }

  const nextTeacherId = payload?.teacherId || session.teacher;
  const nextGradeRef = await resolveGradeRef({
    gradeId: payload?.gradeId !== undefined ? payload.gradeId : session.gradeId,
    gradeLevel: payload?.grade !== undefined ? payload.grade : session.grade,
    required: true,
  });
  const nextSubjectRef = await resolveSubjectRef({
    subjectId: payload?.subjectId !== undefined ? payload.subjectId : session.subjectId,
    subject: payload?.subject !== undefined ? payload.subject : session.subject,
    required: true,
  });

  await ensureTeacherCanTeach({
    teacherId: nextTeacherId,
    gradeRef: nextGradeRef,
    subjectRef: nextSubjectRef,
  });

  const allowed = [
    "title",
    "className",
    "date",
    "time",
    "duration",
    "zoomLink",
  ];

  for (const key of allowed) {
    if (payload[key] !== undefined) session[key] = payload[key];
  }

  session.teacher = nextTeacherId;
  session.grade = nextGradeRef.gradeLevel;
  session.gradeId = nextGradeRef.gradeId || null;
  session.subject = nextSubjectRef.subject;
  session.subjectId = nextSubjectRef.subjectId || null;

  await session.save();
  return session;
};

export const approveAdminLiveSession = async ({ sessionId, adminId }) => {
  return SessionService.approveSession(sessionId, adminId);
};

export const rejectAdminLiveSession = async ({ sessionId, adminId, reason }) => {
  if (!reason || !String(reason).trim()) throw new AppError("Rejection reason is required", 400);
  return SessionService.rejectSession(sessionId, adminId, String(reason).trim());
};

export const cancelAdminLiveSession = async ({ sessionId, adminId }) => {
  return SessionService.cancelSession(sessionId, adminId, "admin");
};
