import User from "../user/user.model.js";
import Session from "../session/session.model.js";
import Attendance from "../attendance/attendance.model.js";
import { Submission } from "../submisssion/submission.model.js";
import { Assignment } from "../assignment/assignment.model.js";
import ClassModel from "../class/class.model.js";
import { ActivityLog } from "../activity/activityLog.model.js";
import Grade from "../grade/grade.model.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

const toDateKey = (date) => {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const toNormalizedGradeKey = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "n/a";

  const compact = text
    .replace(/\b(grade|class|section)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (!compact) return "n/a";

  const match = compact.match(/(\d+)([a-z]*)/);
  if (match) {
    const gradeNumber = String(Number(match[1]));
    const suffix = String(match[2] || "").replace(/(st|nd|rd|th)$/i, "");
    return `${gradeNumber}${suffix}`;
  }

  return compact;
};

const getRange = (query = {}) => {
  const to = query?.to ? new Date(query.to) : new Date();
  const from = query?.from ? new Date(query.from) : new Date(to.getTime() - 29 * MS_PER_DAY);
  return {
    from: startOfDay(from),
    to: endOfDay(to),
  };
};

const buildDaySeries = (from, to) => {
  const out = [];
  let cur = new Date(from);
  while (cur < to) {
    out.push({
      key: toDateKey(cur),
      date: new Date(cur),
    });
    cur = new Date(cur.getTime() + MS_PER_DAY);
  }
  return out;
};

const buildGradedSubmissionRangeMatch = (from, to) => ({
  "grade.score": { $ne: null },
  $or: [
    { "grade.gradedAt": { $gte: from, $lt: to } },
    {
      $and: [{ "grade.gradedAt": { $exists: false } }, { createdAt: { $gte: from, $lt: to } }],
    },
  ],
});

export const getAdminAnalyticsOverview = async (query = {}) => {
  const { from, to } = getRange(query);
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const gradedSubmissionRangeMatch = buildGradedSubmissionRangeMatch(from, to);

  const [
    totalActiveUsers,
    dailyActiveUsersAgg,
    sessionActorsToday,
    submittersToday,
    gradersToday,
    attendanceTeachersToday,
    assignmentCreatorsToday,
    lessonCreatorsToday,
    totalUsers,
    avgSessionDurationAgg,
    studentsByDayAgg,
    teachersByDayAgg,
    liveSessionAttendanceAgg,
    submissionWeeklyAgg,
    pendingWeeklyAgg,
    gradePerformanceAgg,
    performanceBandsAgg,
    gradesAgg,
  ] = await Promise.all([
    User.countDocuments({ status: "active" }),
    ActivityLog.aggregate([
      { $match: { createdAt: { $gte: todayStart, $lt: todayEnd }, actor: { $ne: null } } },
      { $group: { _id: "$actor" } },
      { $count: "count" },
    ]),
    Session.distinct("teacher", { createdAt: { $gte: todayStart, $lt: todayEnd } }),
    Submission.distinct("studentId", { createdAt: { $gte: todayStart, $lt: todayEnd } }),
    Submission.distinct("grade.gradedBy", { "grade.gradedAt": { $gte: todayStart, $lt: todayEnd } }),
    Attendance.distinct("teacherId", { date: { $gte: todayStart, $lt: todayEnd } }),
    Assignment.distinct("createdBy", { createdAt: { $gte: todayStart, $lt: todayEnd } }),
    (await import("../lessons/lesson.model.js")).Lesson.distinct("createdBy", {
      createdAt: { $gte: todayStart, $lt: todayEnd },
    }),
    User.countDocuments(),
    Session.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lt: to },
          duration: { $gt: 0 },
          status: { $in: ["ongoing", "completed"] },
        },
      },
      { $group: { _id: null, avg: { $avg: "$duration" } } },
    ]),
    User.aggregate([
      { $match: { role: "student", createdAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]),
    User.aggregate([
      { $match: { role: "teacher", createdAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]),
    Session.aggregate([
      {
        $match: {
          date: { $gte: from, $lt: to },
          "attendance.0": { $exists: true },
        },
      },
      { $unwind: "$attendance" },
      {
        $group: {
          _id: "$attendance.status",
          count: { $sum: 1 },
        },
      },
    ]),
    Submission.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lt: to },
          status: { $in: ["submitted", "graded"] },
        },
      },
      {
        $project: {
          week: { $dateToString: { format: "%Y-%U", date: "$createdAt" } },
        },
      },
      { $group: { _id: "$week", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Submission.aggregate([
      { $match: { status: "pending", createdAt: { $gte: from, $lt: to } } },
      {
        $project: {
          week: { $dateToString: { format: "%Y-%U", date: "$createdAt" } },
        },
      },
      { $group: { _id: "$week", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Submission.aggregate([
      { $match: gradedSubmissionRangeMatch },
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
          from: "classes",
          localField: "assignment.classId",
          foreignField: "_id",
          as: "cls",
        },
      },
      { $unwind: { path: "$cls", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "grades",
          localField: "assignment.gradeId",
          foreignField: "_id",
          // Keep submission.grade (embedded score) intact by not reusing the alias "grade"
          as: "gradeDoc",
        },
      },
      { $unwind: { path: "$gradeDoc", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          resolvedGradeLevel: {
            $ifNull: [
              "$cls.gradeLevel",
              {
                $ifNull: [
                  "$assignment.classInfo.gradeLevel",
                  {
                    $ifNull: ["$gradeDoc.label", "$student.gradeLevel"],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$resolvedGradeLevel", "N/A"] },
          avgScorePct: {
            $avg: {
              $multiply: [{ $divide: ["$grade.score", "$assignment.points"] }, 100],
            },
          },
          gradedCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Submission.aggregate([
      { $match: gradedSubmissionRangeMatch },
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
          from: "classes",
          localField: "assignment.classId",
          foreignField: "_id",
          as: "cls",
        },
      },
      { $unwind: { path: "$cls", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "grades",
          localField: "assignment.gradeId",
          foreignField: "_id",
          // Keep submission.grade (embedded score) intact by not reusing the alias "grade"
          as: "gradeDoc",
        },
      },
      { $unwind: { path: "$gradeDoc", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          resolvedGradeLevel: {
            $ifNull: [
              "$cls.gradeLevel",
              {
                $ifNull: [
                  "$assignment.classInfo.gradeLevel",
                  {
                    $ifNull: ["$gradeDoc.label", "$student.gradeLevel"],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            studentId: "$studentId",
            gradeLevel: { $ifNull: ["$resolvedGradeLevel", "N/A"] },
          },
          // Weighted percentage across all graded assignments in the range:
          // totalScore / totalPoints * 100
          totalScore: { $sum: { $ifNull: ["$grade.score", 0] } },
          totalPoints: { $sum: { $ifNull: ["$assignment.points", 0] } },
        },
      },
      {
        $addFields: {
          avgScorePct: {
            $cond: [
              { $gt: ["$totalPoints", 0] },
              { $multiply: [{ $divide: ["$totalScore", "$totalPoints"] }, 100] },
              0,
            ],
          },
        },
      },
      {
        $addFields: {
          band: {
            $switch: {
              branches: [
                { case: { $gte: ["$avgScorePct", 85] }, then: "excellent" },
                { case: { $gte: ["$avgScorePct", 70] }, then: "good" },
                { case: { $gte: ["$avgScorePct", 50] }, then: "average" },
              ],
              default: "needsImprovement",
            },
          },
        },
      },
      {
        $group: {
          _id: {
            gradeLevel: "$_id.gradeLevel",
            band: "$band",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.gradeLevel": 1 } },
    ]),
    Grade.find({ isActive: true }).select("label").lean(),
  ]);

  const fallbackDailyActors = new Set(
    [
      ...(Array.isArray(sessionActorsToday) ? sessionActorsToday : []),
      ...(Array.isArray(submittersToday) ? submittersToday : []),
      ...(Array.isArray(gradersToday) ? gradersToday : []),
      ...(Array.isArray(attendanceTeachersToday) ? attendanceTeachersToday : []),
      ...(Array.isArray(assignmentCreatorsToday) ? assignmentCreatorsToday : []),
      ...(Array.isArray(lessonCreatorsToday) ? lessonCreatorsToday : []),
    ]
      .filter(Boolean)
      .map((id) => String(id))
  );
  const dailyActiveUsers = dailyActiveUsersAgg?.[0]?.count || fallbackDailyActors.size;
  const userRetention = totalUsers > 0 ? round2((totalActiveUsers / totalUsers) * 100) : 0;
  const avgSessionTime = round2(avgSessionDurationAgg?.[0]?.avg || 0);

  const studentsMap = new Map(studentsByDayAgg.map((x) => [String(x._id), x.count]));
  const teachersMap = new Map(teachersByDayAgg.map((x) => [String(x._id), x.count]));
  const daySeries = buildDaySeries(from, to);
  const dailyActivityTrend = daySeries.map((d) => ({
    date: d.key,
    students: studentsMap.get(d.key) || 0,
    teachers: teachersMap.get(d.key) || 0,
  }));

  const attendanceCounts = { present: 0, absent: 0, late: 0 };
  for (const row of liveSessionAttendanceAgg) {
    const statusKey = String(row?._id || "").trim().toLowerCase();
    if (attendanceCounts[statusKey] !== undefined) {
      attendanceCounts[statusKey] = Number(row?.count || 0);
    }
  }
  const attendanceTotal =
    attendanceCounts.present + attendanceCounts.absent + attendanceCounts.late;
  const attendanceDistribution = {
    present: attendanceCounts.present,
    absent: attendanceCounts.absent,
    late: attendanceCounts.late,
    presentPct: attendanceTotal ? round2((attendanceCounts.present / attendanceTotal) * 100) : 0,
    absentPct: attendanceTotal ? round2((attendanceCounts.absent / attendanceTotal) * 100) : 0,
    latePct: attendanceTotal ? round2((attendanceCounts.late / attendanceTotal) * 100) : 0,
  };

  const weekIndexMap = new Map();
  const assignmentSubmissions = [];
  const ensureWeek = (weekKey) => {
    if (!weekIndexMap.has(weekKey)) {
      weekIndexMap.set(weekKey, assignmentSubmissions.length);
      assignmentSubmissions.push({
        week: weekKey,
        submitted: 0,
        pending: 0,
      });
    }
    return weekIndexMap.get(weekKey);
  };

  for (const row of submissionWeeklyAgg) {
    const i = ensureWeek(String(row._id));
    assignmentSubmissions[i].submitted = row.count;
  }
  for (const row of pendingWeeklyAgg) {
    const i = ensureWeek(String(row._id));
    assignmentSubmissions[i].pending = row.count;
  }

  const gradeLabels = Array.from(
    new Set(
      (Array.isArray(gradesAgg) ? gradesAgg.map((g) => String(g?.label || "").trim()) : []).filter(
        Boolean
      )
    )
  );

  const gradePerformanceMap = new Map(
    gradePerformanceAgg
      .filter((row) => String(row?._id || "N/A") !== "N/A")
      .map((row) => [
        String(row?._id || "N/A"),
        {
          gradeLevel: String(row?._id || "N/A"),
          avgScorePct: round2(row?.avgScorePct || 0),
          gradedCount: Number(row?.gradedCount || 0),
        },
      ])
  );

  for (const gradeLevel of gradeLabels) {
    if (!gradePerformanceMap.has(gradeLevel)) {
      gradePerformanceMap.set(gradeLevel, {
        gradeLevel,
        avgScorePct: 0,
        gradedCount: 0,
      });
    }
  }

  const studentPerformanceByGradeLevel = Array.from(gradePerformanceMap.values()).sort((a, b) =>
    String(a.gradeLevel || "").localeCompare(String(b.gradeLevel || ""))
  );

  const performanceMap = new Map();
  for (const row of performanceBandsAgg) {
    const gradeLevel = String(row?._id?.gradeLevel || "N/A");
    if (gradeLevel === "N/A") continue;
    const band = String(row?._id?.band || "").trim();
    if (!performanceMap.has(gradeLevel)) {
      performanceMap.set(gradeLevel, {
        gradeLevel,
        excellent: 0,
        good: 0,
        average: 0,
        needsImprovement: 0,
      });
    }
    if (["excellent", "good", "average", "needsImprovement"].includes(band)) {
      performanceMap.get(gradeLevel)[band] = Number(row?.count || 0);
    }
  }
  for (const gradeLevel of gradeLabels) {
    if (!performanceMap.has(gradeLevel)) {
      performanceMap.set(gradeLevel, {
        gradeLevel,
        excellent: 0,
        good: 0,
        average: 0,
        needsImprovement: 0,
      });
    }
  }
  const studentPerformanceBandsByGradeLevel = Array.from(performanceMap.values()).sort((a, b) =>
    String(a.gradeLevel || "").localeCompare(String(b.gradeLevel || ""))
  );

  return {
    range: { from, to },
    cards: {
      activeUsers: totalActiveUsers,
      dailyActiveUsers,
      userRetention,
      avgSessionTimeMinutes: avgSessionTime,
    },
    dailyActivityTrend,
    attendanceDistribution,
    assignmentSubmissions,
    studentPerformanceByGradeLevel,
    studentPerformanceBandsByGradeLevel,
  };
};

export const getAdminAnalyticsStudentProgress = async (query = {}) => {
  const { from, to } = getRange(query);
  const gradedSubmissionRangeMatch = buildGradedSubmissionRangeMatch(from, to);

  const [students, gradedByGrade, assignmentsByGrade, attendanceByGrade, submissionsByStudent, attendanceByStudent] = await Promise.all([
    User.find({ role: "student", status: "active" }).select("_id name gradeLevel").lean(),
    Submission.aggregate([
      { $match: gradedSubmissionRangeMatch },
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
          from: "classes",
          localField: "assignment.classId",
          foreignField: "_id",
          as: "cls",
        },
      },
      { $unwind: { path: "$cls", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          resolvedGradeLevel: {
            $ifNull: ["$cls.gradeLevel", "$assignment.classInfo.gradeLevel"],
          },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$resolvedGradeLevel", "N/A"] },
          avgScorePct: {
            $avg: {
              $cond: [
                { $gt: ["$assignment.points", 0] },
                { $multiply: [{ $divide: ["$grade.score", "$assignment.points"] }, 100] },
                0,
              ],
            },
          },
          gradedCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Assignment.aggregate([
      {
        $lookup: {
          from: "classes",
          localField: "classId",
          foreignField: "_id",
          as: "cls",
        },
      },
      { $unwind: { path: "$cls", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "grades",
          localField: "gradeId",
          foreignField: "_id",
          as: "grade",
        },
      },
      { $unwind: { path: "$grade", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          resolvedGradeLevel: {
            $ifNull: ["$cls.gradeLevel", { $ifNull: ["$classInfo.gradeLevel", "$grade.label"] }],
          },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$resolvedGradeLevel", "N/A"] },
          assignments: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Attendance.aggregate([
      { $match: { date: { $gte: from, $lt: to } } },
      {
        $lookup: {
          from: "classes",
          localField: "classId",
          foreignField: "_id",
          as: "cls",
        },
      },
      { $unwind: "$cls" },
      { $unwind: "$records" },
      {
        $group: {
          _id: "$cls.gradeLevel",
          total: { $sum: 1 },
          present: {
            $sum: {
              $cond: [{ $eq: ["$records.status", "Present"] }, 1, 0],
            },
          },
          late: {
            $sum: {
              $cond: [{ $eq: ["$records.status", "Late"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Submission.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to }, studentId: { $ne: null } } },
      { $sort: { assignmentId: 1, studentId: 1, submittedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: {
            studentId: "$studentId",
            assignmentId: "$assignmentId",
          },
          latest: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latest" } },
      {
        $lookup: {
          from: "assignments",
          localField: "assignmentId",
          foreignField: "_id",
          as: "assignment",
        },
      },
      { $unwind: { path: "$assignment", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$studentId",
          completedAssignments: {
            $sum: {
              $cond: [{ $in: ["$status", ["submitted", "graded"]] }, 1, 0],
            },
          },
          gradedAssignments: {
            $sum: {
              $cond: [{ $ne: ["$grade.score", null] }, 1, 0],
            },
          },
          totalScore: {
            $sum: {
              $cond: [{ $ne: ["$grade.score", null] }, { $ifNull: ["$grade.score", 0] }, 0],
            },
          },
          totalPoints: {
            $sum: {
              $cond: [{ $ne: ["$grade.score", null] }, { $ifNull: ["$assignment.points", 0] }, 0],
            },
          },
        },
      },
    ]),
    Attendance.aggregate([
      { $match: { date: { $gte: from, $lt: to } } },
      { $unwind: "$records" },
      {
        $group: {
          _id: "$records.studentId",
          total: { $sum: 1 },
          presentLate: {
            $sum: {
              $cond: [{ $in: ["$records.status", ["Present", "Late"]] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  const assignmentsMap = new Map();
  const assignmentsMapNormalized = new Map();
  for (const row of assignmentsByGrade) {
    const rawKey = String(row?._id || "N/A").trim() || "N/A";
    const count = Number(row?.assignments || 0);
    assignmentsMap.set(rawKey, count);

    const normalizedKey = toNormalizedGradeKey(rawKey);
    assignmentsMapNormalized.set(
      normalizedKey,
      Number(assignmentsMapNormalized.get(normalizedKey) || 0) + count
    );
  }
  const attendanceMap = new Map(attendanceByGrade.map((x) => [String(x._id), x]));
  const gradedByGradeMap = new Map(gradedByGrade.map((x) => [String(x._id), x]));

  const byGradeKeys = new Set([
    ...assignmentsMap.keys(),
    ...attendanceMap.keys(),
    ...gradedByGradeMap.keys(),
  ]);

  const byGrade = Array.from(byGradeKeys)
    .sort((a, b) => a.localeCompare(b))
    .map((gradeLevel) => {
    const graded = gradedByGradeMap.get(gradeLevel) || { avgScorePct: 0, gradedCount: 0 };
    const a = assignmentsMap.get(gradeLevel) || 0;
    const att = attendanceMap.get(gradeLevel) || { total: 0, present: 0, late: 0 };
    const attendanceRate =
      att.total > 0 ? round2(((att.present + att.late) / att.total) * 100) : 0;

    return {
      gradeLevel: gradeLevel || "N/A",
      avgScorePct: round2(graded.avgScorePct || 0),
      gradedCount: Number(graded.gradedCount || 0),
      assignmentsCount: a,
      attendanceRate,
    };
  });

  const byStudentSubmissionsMap = new Map(
    submissionsByStudent.map((x) => [String(x._id), x])
  );
  const byStudentAttendanceMap = new Map(
    attendanceByStudent.map((x) => [String(x._id), x])
  );

  const toStatus = (avgScorePct) => {
    if (avgScorePct >= 85) return "Excellent";
    if (avgScorePct >= 70) return "Good";
    if (avgScorePct >= 50) return "Average";
    return "Needs Improvement";
  };

  const studentsProgress = students.map((s) => {
    const sub = byStudentSubmissionsMap.get(String(s._id)) || {
      completedAssignments: 0,
      gradedAssignments: 0,
      totalScore: 0,
      totalPoints: 0,
    };
    const att = byStudentAttendanceMap.get(String(s._id)) || { total: 0, presentLate: 0 };
    const gradeLevel = String(s.gradeLevel || "N/A").trim() || "N/A";
    const assignmentsTotalForGrade = Number(
      assignmentsMap.get(gradeLevel) ??
        assignmentsMapNormalized.get(toNormalizedGradeKey(gradeLevel)) ??
        0
    );
    const assignmentsCompleted = Number(sub.completedAssignments || 0);
    const safeAssignmentsTotal = Math.max(assignmentsTotalForGrade, assignmentsCompleted);
    const attendancePct = att.total > 0 ? round2((att.presentLate / att.total) * 100) : 0;
    const avgScorePct = sub.totalPoints > 0 ? round2((sub.totalScore / sub.totalPoints) * 100) : 0;

    return {
      studentId: s._id,
      studentName: s.name,
      grade: gradeLevel,
      assignmentsCompleted,
      assignmentsTotal: safeAssignmentsTotal,
      assignments: {
        completed: assignmentsCompleted,
        total: safeAssignmentsTotal,
        text: `${assignmentsCompleted}/${safeAssignmentsTotal}`,
      },
      attendancePct,
      avgScorePct,
      status: toStatus(avgScorePct),
      _hasAttendance: Number(att.total || 0) > 0,
      _hasScore: Number(sub.totalPoints || 0) > 0,
    };
  }).sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || "")));

  const totalStudents = studentsProgress.length;
  const attendanceRows = studentsProgress.filter((x) => x._hasAttendance);
  const performanceRows = studentsProgress.filter((x) => x._hasScore);
  const avgAttendance =
    attendanceRows.length > 0
      ? round2(
          attendanceRows.reduce((sum, x) => sum + Number(x.attendancePct || 0), 0) /
            attendanceRows.length
        )
      : 0;
  const assignmentsCompleted = studentsProgress.reduce(
    (sum, x) => sum + Number(x.assignments?.completed || 0),
    0
  );
  const avgPerformance =
    performanceRows.length > 0
      ? round2(
          performanceRows.reduce((sum, x) => sum + Number(x.avgScorePct || 0), 0) /
            performanceRows.length
        )
      : 0;

  return {
    range: { from, to },
    cards: {
      totalStudents,
      avgAttendance,
      assignmentsCompleted,
      avgPerformance,
    },
    students: studentsProgress.map(({ _hasAttendance, _hasScore, ...rest }) => rest),
    byGrade,
  };
};

export const getAdminAnalyticsTeacherActivity = async (query = {}) => {
  const { from, to } = getRange(query);
  const today = startOfDay(new Date());
  const weekStart = new Date(today.getTime() - 6 * MS_PER_DAY);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * MS_PER_DAY);
  const prevWeekEnd = new Date(weekStart);

  const [totalTeachers, teachers, classesAgg, lessonsAgg, assignmentsAgg, sessionsAgg, lessonsWeekAgg, lessonsPrevWeekAgg, sessionsWeekAgg, sessionsPrevWeekAgg] = await Promise.all([
    User.countDocuments({ role: "teacher", status: "active" }),
    User.find({ role: "teacher", status: "active" }).select("_id name subject subjectId").lean(),
    ClassModel.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: "$teacher", classesCount: { $sum: 1 } } },
    ]),
    (await import("../lessons/lesson.model.js")).Lesson.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: "$createdBy", lessonsCount: { $sum: 1 } } },
    ]),
    Assignment.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: "$createdBy", assignmentsCount: { $sum: 1 } } },
    ]),
    Session.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: "$teacher",
          sessionsCount: { $sum: 1 },
          completedSessionsCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
            },
          },
        },
      },
    ]),
    (await import("../lessons/lesson.model.js")).Lesson.aggregate([
      { $match: { createdAt: { $gte: weekStart, $lt: to } } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]),
    (await import("../lessons/lesson.model.js")).Lesson.aggregate([
      { $match: { createdAt: { $gte: prevWeekStart, $lt: prevWeekEnd } } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]),
    Session.aggregate([
      { $match: { createdAt: { $gte: weekStart, $lt: to } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
            },
          },
        },
      },
    ]),
    Session.aggregate([
      { $match: { createdAt: { $gte: prevWeekStart, $lt: prevWeekEnd } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  const classesMap = new Map(classesAgg.map((x) => [String(x._id), x.classesCount]));
  const lessonsMap = new Map(lessonsAgg.map((x) => [String(x._id), x.lessonsCount]));
  const assignmentsMap = new Map(assignmentsAgg.map((x) => [String(x._id), x.assignmentsCount]));
  const sessionsMap = new Map(sessionsAgg.map((x) => [String(x._id), x]));
  const toPerformance = (engagementPct) => {
    if (engagementPct >= 85) return "Excellent";
    if (engagementPct >= 70) return "Good";
    if (engagementPct >= 50) return "Average";
    return "Needs Improvement";
  };

  const byTeacher = teachers.map((t) => {
    const sid = String(t._id);
    const s = sessionsMap.get(sid) || { sessionsCount: 0, completedSessionsCount: 0 };
    const engagementPct =
      Number(s.sessionsCount || 0) > 0
        ? round2((Number(s.completedSessionsCount || 0) / Number(s.sessionsCount || 0)) * 100)
        : 0;

    return {
      teacherId: t._id,
      teacherName: t.name,
      name: t.name,
      subject: t.subject || null,
      subjectId: t.subjectId || null,
      classesCount: classesMap.get(sid) || 0,
      lessonsCount: lessonsMap.get(sid) || 0,
      assignmentsCount: assignmentsMap.get(sid) || 0,
      lessonsUploaded: lessonsMap.get(sid) || 0,
      sessionsCount: s.sessionsCount || 0,
      sessionsCreated: s.sessionsCount || 0,
      completedSessionsCount: s.completedSessionsCount || 0,
      engagementPct,
      performance: toPerformance(engagementPct),
    };
  }).sort((a, b) => String(a.teacherName || "").localeCompare(String(b.teacherName || "")));

  const lessonsUploaded = byTeacher.reduce((sum, t) => sum + Number(t.lessonsUploaded || 0), 0);
  const sessionsCreated = byTeacher.reduce((sum, t) => sum + Number(t.sessionsCreated || 0), 0);
  const avgEngagement =
    byTeacher.length > 0
      ? round2(
          byTeacher.reduce((sum, t) => sum + Number(t.engagementPct || 0), 0) / byTeacher.length
        )
      : 0;

  const lessonsUploadedThisWeek = Number(lessonsWeekAgg?.[0]?.count || 0);
  const lessonsUploadedPrevWeek = Number(lessonsPrevWeekAgg?.[0]?.count || 0);
  const sessionsThisWeekTotal = Number(sessionsWeekAgg?.[0]?.total || 0);
  const sessionsPrevWeekTotal = Number(sessionsPrevWeekAgg?.[0]?.total || 0);
  const sessionsCompletedThisWeek = Number(sessionsWeekAgg?.[0]?.completed || 0);
  const sessionsCompletedPrevWeek = Number(sessionsPrevWeekAgg?.[0]?.completed || 0);
  const engagementThisWeek =
    sessionsThisWeekTotal > 0 ? round2((sessionsCompletedThisWeek / sessionsThisWeekTotal) * 100) : 0;
  const engagementPrevWeek =
    sessionsPrevWeekTotal > 0 ? round2((sessionsCompletedPrevWeek / sessionsPrevWeekTotal) * 100) : 0;

  return {
    range: { from, to },
    cards: {
      totalTeachers,
      lessonsUploaded,
      lessonsUploadedThisWeekDelta: lessonsUploadedThisWeek - lessonsUploadedPrevWeek,
      sessionsCreated,
      sessionsCreatedThisWeekDelta: sessionsThisWeekTotal - sessionsPrevWeekTotal,
      avgEngagement,
      avgEngagementChangePct: round2(engagementThisWeek - engagementPrevWeek),
    },
    teachers: byTeacher,
    byTeacher,
  };
};
