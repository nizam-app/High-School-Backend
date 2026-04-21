import User from "../user/user.model.js";
import ClassModel from "../class/class.model.js";
import Session from "../session/session.model.js";
import { Submission } from "../submisssion/submission.model.js";
import { ActivityLog } from "../activity/activityLog.model.js";
import Attendance from "../attendance/attendance.model.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
};

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toDateKey = (date) => {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const buildSevenDayRange = () => {
  const today = startOfDay(new Date());
  const start = new Date(today.getTime() - 6 * MS_PER_DAY);
  const days = [];

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start.getTime() + i * MS_PER_DAY);
    days.push({
      key: toDateKey(d),
      label: dayLabels[d.getUTCDay()],
      start: d,
      end: new Date(d.getTime() + MS_PER_DAY),
    });
  }

  return { start, end: endOfDay(today), days };
};

const buildPreviousSevenDayRange = (currentRangeStart) => {
  const end = new Date(currentRangeStart);
  const start = new Date(end.getTime() - 7 * MS_PER_DAY);
  return { start, end };
};

const mapGroupedCounts = (rows = []) => {
  const out = new Map();
  for (const row of rows) {
    if (!row?._id) continue;
    out.set(String(row._id), Number(row.count || 0));
  }
  return out;
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const percentChange = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return round2(((current - previous) / previous) * 100);
};

export const getAdminDashboardOverview = async () => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const lastWeekSameDayStart = new Date(todayStart.getTime() - 7 * MS_PER_DAY);
  const lastWeekSameDayEnd = new Date(todayEnd.getTime() - 7 * MS_PER_DAY);

  const [
    totalStudents,
    totalTeachers,
    activeClasses,
    liveSessionsToday,
    assignmentsPending,
  ] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "teacher" }),
    ClassModel.countDocuments({ status: "active" }),
    Session.countDocuments({
      date: { $gte: todayStart, $lt: todayEnd },
      status: { $in: ["pending", "approved", "ongoing"] },
    }),
    Submission.countDocuments({ status: "submitted" }),
  ]);

  const attendanceStats = await Attendance.aggregate([
    { $unwind: "$records" },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        engaged: {
          $sum: {
            $cond: [{ $in: ["$records.status", ["Present", "Late"]] }, 1, 0],
          },
        },
      },
    },
  ]);

  const totalAttendance = attendanceStats?.[0]?.total || 0;
  const engagedAttendance = attendanceStats?.[0]?.engaged || 0;
  const engagementRate = totalAttendance
    ? round2((engagedAttendance / totalAttendance) * 100)
    : 0;

  const weeklyRange = buildSevenDayRange();
  const previousWeeklyRange = buildPreviousSevenDayRange(weeklyRange.start);
  const [studentsByDay, teachersByDay, sessionsByDay, weeklyStats, previousWeeklyStats] = await Promise.all([
    User.aggregate([
      {
        $match: {
          role: "student",
          createdAt: { $gte: weeklyRange.start, $lt: weeklyRange.end },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "UTC",
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    User.aggregate([
      {
        $match: {
          role: "teacher",
          createdAt: { $gte: weeklyRange.start, $lt: weeklyRange.end },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "UTC",
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Session.aggregate([
      {
        $match: {
          createdAt: { $gte: weeklyRange.start, $lt: weeklyRange.end },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "UTC",
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Promise.all([
      User.countDocuments({
        role: "student",
        createdAt: { $gte: weeklyRange.start, $lt: weeklyRange.end },
      }),
      User.countDocuments({
        role: "teacher",
        createdAt: { $gte: weeklyRange.start, $lt: weeklyRange.end },
      }),
      ClassModel.countDocuments({
        status: "active",
        createdAt: { $gte: weeklyRange.start, $lt: weeklyRange.end },
      }),
      Session.countDocuments({
        date: { $gte: todayStart, $lt: todayEnd },
        status: { $in: ["pending", "approved", "ongoing"] },
      }),
      Submission.countDocuments({
        status: "submitted",
        createdAt: { $gte: weeklyRange.start, $lt: weeklyRange.end },
      }),
      Attendance.aggregate([
        {
          $match: {
            date: { $gte: weeklyRange.start, $lt: weeklyRange.end },
          },
        },
        { $unwind: "$records" },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            engaged: {
              $sum: {
                $cond: [{ $in: ["$records.status", ["Present", "Late"]] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]),
    Promise.all([
      User.countDocuments({
        role: "student",
        createdAt: { $gte: previousWeeklyRange.start, $lt: previousWeeklyRange.end },
      }),
      User.countDocuments({
        role: "teacher",
        createdAt: { $gte: previousWeeklyRange.start, $lt: previousWeeklyRange.end },
      }),
      ClassModel.countDocuments({
        status: "active",
        createdAt: { $gte: previousWeeklyRange.start, $lt: previousWeeklyRange.end },
      }),
      Session.countDocuments({
        date: { $gte: lastWeekSameDayStart, $lt: lastWeekSameDayEnd },
        status: { $in: ["pending", "approved", "ongoing"] },
      }),
      Submission.countDocuments({
        status: "submitted",
        createdAt: { $gte: previousWeeklyRange.start, $lt: previousWeeklyRange.end },
      }),
      Attendance.aggregate([
        {
          $match: {
            date: { $gte: previousWeeklyRange.start, $lt: previousWeeklyRange.end },
          },
        },
        { $unwind: "$records" },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            engaged: {
              $sum: {
                $cond: [{ $in: ["$records.status", ["Present", "Late"]] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]),
  ]);

  const studentsMap = mapGroupedCounts(studentsByDay);
  const teachersMap = mapGroupedCounts(teachersByDay);
  const sessionsMap = mapGroupedCounts(sessionsByDay);

  const weeklyActivity = weeklyRange.days.map((d) => ({
    day: d.label,
    date: d.key,
    students: studentsMap.get(d.key) || 0,
    teachers: teachersMap.get(d.key) || 0,
    sessions: sessionsMap.get(d.key) || 0,
  }));

  const [
    studentsThisWeek,
    teachersThisWeek,
    classesThisWeek,
    sessionsTodayCount,
    assignmentsThisWeek,
    engagementThisWeekAgg,
  ] = weeklyStats;
  const [
    studentsLastWeek,
    teachersLastWeek,
    classesLastWeek,
    sessionsLastWeekSameDay,
    assignmentsLastWeek,
    engagementLastWeekAgg,
  ] = previousWeeklyStats;

  const engagementThisWeekTotal = engagementThisWeekAgg?.[0]?.total || 0;
  const engagementThisWeekEngaged = engagementThisWeekAgg?.[0]?.engaged || 0;
  const engagementThisWeek = engagementThisWeekTotal
    ? round2((engagementThisWeekEngaged / engagementThisWeekTotal) * 100)
    : 0;

  const engagementLastWeekTotal = engagementLastWeekAgg?.[0]?.total || 0;
  const engagementLastWeekEngaged = engagementLastWeekAgg?.[0]?.engaged || 0;
  const engagementLastWeek = engagementLastWeekTotal
    ? round2((engagementLastWeekEngaged / engagementLastWeekTotal) * 100)
    : 0;

  const cardsDelta = {
    totalStudentsPct: percentChange(studentsThisWeek, studentsLastWeek),
    totalTeachersPct: percentChange(teachersThisWeek, teachersLastWeek),
    activeClassesPct: percentChange(classesThisWeek, classesLastWeek),
    liveSessionsTodayPct: percentChange(sessionsTodayCount, sessionsLastWeekSameDay),
    assignmentsPendingPct: percentChange(assignmentsThisWeek, assignmentsLastWeek),
    engagementRatePct: percentChange(engagementThisWeek, engagementLastWeek),
  };

  const studentDistributionByGradeRaw = await User.aggregate([
    { $match: { role: "student" } },
    {
      $group: {
        _id: { $ifNull: ["$gradeLevel", "Unassigned"] },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const totalDistribution = studentDistributionByGradeRaw.reduce(
    (sum, row) => sum + Number(row.count || 0),
    0
  );

  const studentDistributionByGrade = studentDistributionByGradeRaw.map((row) => ({
    grade: row._id,
    count: row.count,
    percentage: totalDistribution ? round2((row.count / totalDistribution) * 100) : 0,
  }));

  const averageSubjectPerformance = await Submission.aggregate([
    { $match: { "grade.score": { $ne: null } } },
    {
      $lookup: {
        from: "assignments",
        localField: "assignmentId",
        foreignField: "_id",
        as: "assignment",
      },
    },
    { $unwind: "$assignment" },
    {
      $lookup: {
        from: "subjects",
        localField: "assignment.subjectId",
        foreignField: "_id",
        as: "subjectDoc",
      },
    },
    {
      $project: {
        classInfoSubject: {
          $trim: {
            input: { $ifNull: ["$assignment.classInfo.subject", ""] },
          },
        },
        subjectFromRef: {
          $ifNull: [{ $arrayElemAt: ["$subjectDoc.name", 0] }, "Unknown"],
        },
        score: "$grade.score",
        points: "$assignment.points",
      },
    },
    {
      $addFields: {
        subject: {
          $cond: [
            { $gt: [{ $strLenCP: "$classInfoSubject" }, 0] },
            "$classInfoSubject",
            "$subjectFromRef",
          ],
        },
      },
    },
    {
      $match: {
        points: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: "$subject",
        avgPercentage: {
          $avg: {
            $multiply: [{ $divide: ["$score", "$points"] }, 100],
          },
        },
        gradedCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const normalizedSubjectPerformance = averageSubjectPerformance.map((row) => ({
    subject: row._id,
    averagePercentage: round2(row.avgPercentage || 0),
    gradedCount: row.gradedCount,
  }));

  const recentActivitiesRaw = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("actor", "name role");

  const recentActivities = recentActivitiesRaw.map((a) => ({
    id: a._id,
    actor: a.actor
      ? { id: a.actor._id, name: a.actor.name, role: a.actor.role }
      : null,
    actorRole: a.actorRole,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    summary: a.summary,
    metadata: a.metadata || {},
    createdAt: a.createdAt,
  }));

  return {
    cards: {
      totalStudents,
      totalTeachers,
      activeClasses,
      liveSessionsToday,
      assignmentsPending,
      engagementRate,
    },
    cardsDelta,
    weeklyActivity,
    studentDistributionByGrade,
    averageSubjectPerformance: normalizedSubjectPerformance,
    recentActivities,
  };
};
