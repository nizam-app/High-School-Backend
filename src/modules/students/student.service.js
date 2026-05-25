import mongoose from "mongoose";
import User from "../user/user.model.js";
import Class from "../class/class.model.js";
import { TimetableSlot } from "../timetable/timetableSlot.model.js";
import { Submission } from "../submisssion/submission.model.js";
import Session from "../session/session.model.js";
import { Lesson } from "../lessons/lesson.model.js";
import Grade from "../grade/grade.model.js";
import Subject from "../subject/subject.model.js";
import {
  getMyAssignmentsForStudent,
  getPendingAssignmentsForStudent,
} from "../assignment/assignment.service.js";
import {
  buildStudentClassAccessFilterForStudent,
  buildStudentPublishedLessonFilter,
  buildStudentAssignmentFilter,
  mapStudentClassSummary,
} from "../../utils/studentClassAccess.js";
import { Assignment } from "../assignment/assignment.model.js";
import {
  calculateStudentAssignmentAttendance,
  pickLatestSubmissionPerAssignment,
} from "../../utils/studentAssignmentAttendance.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const getMyClasses = async (studentId) => {
  const sid = String(studentId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(sid)) return [];

  const student = await User.findById(sid)
    .select("gradeLevel gradeId assignedSubjects assignedSubjectIds")
    .lean();

  const classes = await Class.find(await buildStudentClassAccessFilterForStudent(student, sid))
    .populate("teacher", "name role")
    .sort({ subject: 1, createdAt: -1 })
    .lean();

  return classes.map(mapStudentClassSummary);
};

export const getStudentProgressOverview = async (studentId) => {
  const sid = String(studentId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(sid)) {
    return {
      overview: [],
      summary: {
        averagePercentage: 0,
        subjectsCount: 0,
        gradedAssignments: 0,
        attendancePercentage: 0,
        gradedSubmittedAssignments: 0,
        totalAssignedAssignments: 0,
      },
    };
  }

  const assignmentFilter = await buildStudentAssignmentFilter(null, sid);
  let inScopeAssignmentIds = [];
  if (assignmentFilter._id !== null) {
    const scopedAssignments = await Assignment.find(assignmentFilter).select("_id").lean();
    inScopeAssignmentIds = scopedAssignments.map((row) => row._id);
  }

  const attendanceAssignments = inScopeAssignmentIds.map((id) => ({ _id: id }));
  let attendanceStats = {
    attendancePercentage: 0,
    gradedSubmittedAssignments: 0,
    totalAssignedAssignments: 0,
  };

  if (inScopeAssignmentIds.length) {
    const attendanceSubmissions = await Submission.find({
      studentId: sid,
      assignmentId: { $in: inScopeAssignmentIds },
    })
      .select("assignmentId submittedAt createdAt grade status")
      .lean();
    attendanceStats = calculateStudentAssignmentAttendance(
      attendanceAssignments,
      pickLatestSubmissionPerAssignment(attendanceSubmissions)
    );
  }

  if (!inScopeAssignmentIds.length) {
    const student = await User.findById(sid).select("assignedSubjects").lean();
    const assigned = Array.isArray(student?.assignedSubjects)
      ? student.assignedSubjects.map((s) => String(s || "").trim()).filter(Boolean)
      : [];
    const overview = assigned.map((subject) => ({
      subject,
      totalScore: 0,
      totalPoints: 0,
      gradedCount: 0,
      percentage: 0,
    }));
    return {
      overview,
      summary: {
        averagePercentage: 0,
        subjectsCount: overview.length,
        gradedAssignments: 0,
        attendancePercentage: attendanceStats.attendancePercentage,
        gradedSubmittedAssignments: attendanceStats.gradedSubmittedAssignments,
        totalAssignedAssignments: attendanceStats.totalAssignedAssignments,
      },
    };
  }

  const [student, rows] = await Promise.all([
    User.findById(sid).select("assignedSubjects").lean(),
    Submission.aggregate([
      {
        $match: {
          studentId: new mongoose.Types.ObjectId(sid),
          assignmentId: { $in: inScopeAssignmentIds },
          "grade.score": { $ne: null },
        },
      },
      { $sort: { assignmentId: 1, submittedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: "$assignmentId",
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
      { $unwind: "$assignment" },
      {
        $project: {
          score: "$grade.score",
          points: "$assignment.points",
          subjectId: "$assignment.subjectId",
          fallbackSubject: "$assignment.classInfo.subject",
        },
      },
      { $match: { points: { $gt: 0 } } },
      {
        $lookup: {
          from: "subjects",
          localField: "subjectId",
          foreignField: "_id",
          as: "subjectDoc",
        },
      },
      {
        $project: {
          score: 1,
          points: 1,
          subject: {
            $ifNull: [
              { $arrayElemAt: ["$subjectDoc.name", 0] },
              { $ifNull: ["$fallbackSubject", "Unknown"] },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$subject",
          totalScore: { $sum: "$score" },
          totalPoints: { $sum: "$points" },
          gradedCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          subject: "$_id",
          totalScore: 1,
          totalPoints: 1,
          gradedCount: 1,
          percentage: {
            $cond: [
              { $gt: ["$totalPoints", 0] },
              { $round: [{ $multiply: [{ $divide: ["$totalScore", "$totalPoints"] }, 100] }, 2] },
              0,
            ],
          },
        },
      },
      { $sort: { subject: 1 } },
    ]),
  ]);

  const map = new Map(rows.map((r) => [String(r.subject || "").trim().toLowerCase(), r]));
  const assigned = Array.isArray(student?.assignedSubjects)
    ? student.assignedSubjects.map((s) => String(s || "").trim()).filter(Boolean)
    : [];

  for (const subject of assigned) {
    const key = subject.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        subject,
        totalScore: 0,
        totalPoints: 0,
        gradedCount: 0,
        percentage: 0,
      });
    }
  }

  const overview = Array.from(map.values()).sort((a, b) =>
    String(a.subject).localeCompare(String(b.subject))
  );

  const gradedAssignments = overview.reduce((sum, x) => sum + Number(x.gradedCount || 0), 0);
  const averagePercentage =
    overview.length > 0
      ? round2(overview.reduce((sum, x) => sum + Number(x.percentage || 0), 0) / overview.length)
      : 0;

  return {
    overview,
    summary: {
      averagePercentage,
      subjectsCount: overview.length,
      gradedAssignments,
      attendancePercentage: attendanceStats.attendancePercentage,
      gradedSubmittedAssignments: attendanceStats.gradedSubmittedAssignments,
      totalAssignedAssignments: attendanceStats.totalAssignedAssignments,
    },
  };
};

const toDayKey = (date = new Date()) =>
  ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(date).getDay()];

const minToHHmm = (min) => {
  const h = Math.floor(Number(min || 0) / 60);
  const m = Number(min || 0) % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
};

export const getStudentLessons = async (studentId) => {
  const sid = String(studentId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(sid)) return [];

  const student = await User.findById(sid)
    .select("gradeLevel gradeId assignedSubjects assignedSubjectIds")
    .lean();

  const lessonFilter = await buildStudentPublishedLessonFilter(student, sid);
  const lessons = await Lesson.find(lessonFilter)
    .select("_id title description chapter contentType createdBy subjectId gradeId createdAt files status")
    .populate("subjectId", "_id name")
    .populate("gradeId", "_id label")
    .populate("createdBy", "_id name role")
    .sort({ createdAt: -1 })
    .lean();

  return lessons.map((lesson) => ({
    id: lesson._id,
    title: lesson.title,
    description: lesson.description || "",
    chapter: lesson.chapter,
    contentType: lesson.contentType,
    status: lesson.status,
    subject: lesson?.subjectId?.name || null,
    subjectId: lesson?.subjectId?._id || lesson.subjectId || null,
    grade: lesson?.gradeId?.label || null,
    gradeId: lesson?.gradeId?._id || lesson.gradeId || null,
    createdAt: lesson.createdAt,
    filesCount: Array.isArray(lesson.files) ? lesson.files.length : 0,
    createdBy: lesson?.createdBy
      ? {
          id: lesson.createdBy._id,
          name: lesson.createdBy.name,
          role: lesson.createdBy.role,
        }
      : null,
  }));
};

export const getStudentDashboard = async (studentId) => {
  const sid = String(studentId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(sid)) {
    return {
      cards: {
        enrolledClasses: 0,
        lessons: 0,
        assignments: 0,
        pendingAssignments: 0,
        completed: 0,
        liveSessions: 0,
      },
      activeLiveSessions: [],
      lessons: [],
      assignments: [],
      recentLessons: [],
      upcomingAssignments: [],
      progressOverview: [],
      classes: [],
    };
  }

  const oid = new mongoose.Types.ObjectId(sid);
  const student = await User.findById(oid)
    .select("gradeLevel gradeId assignedSubjects assignedSubjectIds")
    .lean();
  const classAccessFilter = await buildStudentClassAccessFilterForStudent(student, oid);

  const [classes, assignmentsResult, pendingAssignmentsResult, progress] = await Promise.all([
    Class.find(classAccessFilter)
      .select(
        "_id className subject subjectId gradeLevel gradeId teacher teacherName students schedule status maxStudents"
      )
      .populate("teacher", "name")
      .sort({ subject: 1, createdAt: -1 })
      .lean(),
    getMyAssignmentsForStudent({ studentId: oid }),
    getPendingAssignmentsForStudent({ studentId: oid }),
    getStudentProgressOverview(oid),
  ]);
  const gradeIdSet = new Set();
  const subjectIdSet = new Set();
  const gradeLevelSet = new Set();
  const subjectSet = new Set();

  for (const c of classes) {
    if (c?.gradeId) gradeIdSet.add(String(c.gradeId));
    if (c?.subjectId) subjectIdSet.add(String(c.subjectId));
    if (c?.gradeLevel) gradeLevelSet.add(String(c.gradeLevel).trim());
    if (c?.subject) subjectSet.add(String(c.subject).trim());
  }

  if (student?.gradeId) gradeIdSet.add(String(student.gradeId));
  if (student?.gradeLevel) gradeLevelSet.add(String(student.gradeLevel).trim());
  for (const id of Array.isArray(student?.assignedSubjectIds) ? student.assignedSubjectIds : []) {
    subjectIdSet.add(String(id));
  }
  for (const s of Array.isArray(student?.assignedSubjects) ? student.assignedSubjects : []) {
    subjectSet.add(String(s).trim());
  }

  const gradeIds = Array.from(gradeIdSet)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const subjectIds = Array.from(subjectIdSet)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const gradeLevels = Array.from(gradeLevelSet).filter(Boolean);
  const subjects = Array.from(subjectSet).filter(Boolean);

  const gradeClause = [];
  if (gradeIds.length) gradeClause.push({ gradeId: { $in: gradeIds } });
  if (gradeLevels.length) gradeClause.push({ grade: { $in: gradeLevels } });

  const subjectClause = [];
  if (subjectIds.length) subjectClause.push({ subjectId: { $in: subjectIds } });
  if (subjects.length) subjectClause.push({ subject: { $in: subjects } });

  const sessionQuery = { status: "ongoing" };
  const and = [];
  if (gradeClause.length) and.push(gradeClause.length > 1 ? { $or: gradeClause } : gradeClause[0]);
  if (subjectClause.length) and.push(subjectClause.length > 1 ? { $or: subjectClause } : subjectClause[0]);
  if (and.length) sessionQuery.$and = and;
  else sessionQuery._id = null;

  const sessions = await Session.find(sessionQuery)
    .select("_id title className subject date time status zoomLink")
    .sort({ date: 1, time: 1 })
    .lean();

  const assignments = Array.isArray(assignmentsResult?.data) ? assignmentsResult.data : [];
  const gradePendingAssignments = Array.isArray(pendingAssignmentsResult?.data)
    ? pendingAssignmentsResult.data
    : [];
  const pendingAssignments = gradePendingAssignments.length;
  const completed = assignments.filter((a) => a.myStatus === "graded").length;

  const activeLiveSessions = sessions;
  const lessonFilter = await buildStudentPublishedLessonFilter(student, oid);

  const lessons = await Lesson.find(lessonFilter)
    .select("_id title description chapter contentType createdBy subjectId gradeId createdAt files")
    .populate("subjectId", "_id name")
    .populate("gradeId", "_id label")
    .populate("createdBy", "_id name role")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const recentLessons = lessons.map((lesson) => ({
    id: lesson._id,
    title: lesson.title,
    description: lesson.description || "",
    chapter: lesson.chapter,
    contentType: lesson.contentType,
    subject: lesson?.subjectId?.name || null,
    grade: lesson?.gradeId?.label || null,
    createdAt: lesson.createdAt,
    filesCount: Array.isArray(lesson.files) ? lesson.files.length : 0,
    createdBy: lesson?.createdBy
      ? {
          id: lesson.createdBy._id,
          name: lesson.createdBy.name,
          role: lesson.createdBy.role,
        }
      : null,
  }));

  const assignmentList = assignments
    .sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0))
    .map((a) => ({
      id: a._id,
      title: a.title,
      description: a.description || "",
      subject: a?.subjectId?.name || a?.classInfo?.subject || null,
      grade: a?.gradeId?.label || a?.classInfo?.gradeLevel || null,
      dueAt: a.dueAt,
      points: a.points,
      myStatus: a.myStatus,
      myGrade: a.myGrade || null,
      status: a.status,
      lateAllowed: Boolean(a.lateAllowed),
      createdBy: a?.createdBy
        ? {
            id: a.createdBy._id || a.createdBy,
            name: a.createdBy.name || null,
            role: a.createdBy.role || null,
          }
        : null,
    }));

  const upcomingAssignments = gradePendingAssignments
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .map((a) => ({
      id: a._id,
      title: a.title,
      subject: a?.subjectId?.name || a?.classInfo?.subject || null,
      dueAt: a.dueAt,
      points: a.points,
      myStatus: a.myStatus,
      createdBy: a?.createdBy
        ? {
            id: a.createdBy._id || a.createdBy,
            name: a.createdBy.name || null,
            role: a.createdBy.role || null,
          }
        : null,
    }));

  const classSummaries = classes.map(mapStudentClassSummary);

  return {
    classes: classSummaries,
    cards: {
      enrolledClasses: classSummaries.length,
      lessons: recentLessons.length,
      assignments: assignmentList.length,
      pendingAssignments,
      completed,
      liveSessions: activeLiveSessions.length,
    },
    activeLiveSessions: activeLiveSessions.map((s) => ({
      id: s._id,
      title: s.title,
      subject: s.subject,
      date: s.date,
      time: s.time,
      status: s.status,
      zoomLink: s.zoomLink,
    })),
    lessons: recentLessons,
    assignments: assignmentList,
    recentLessons,
    pendingAssignmentsList: upcomingAssignments,
    upcomingAssignments,
    progressOverview: (progress?.overview || []).map((x) => ({
      subject: x.subject,
      percentage: x.percentage,
    })),
  };
};

export const getStudentTimetable = async (studentId) => {
  const sid = String(studentId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(sid)) {
    return { today: toDayKey(), groupedByDay: {} };
  }

  const student = await User.findById(sid)
    .select("gradeLevel gradeId assignedSubjects assignedSubjectIds")
    .lean();

  const classes = await Class.find(await buildStudentClassAccessFilterForStudent(student, sid))
    .select("_id subject gradeLevel teacher schedule")
    .populate("teacher", "name")
    .lean();
  const classIds = classes.map((cls) => cls?._id).filter(Boolean);
  const timetableSlots = classIds.length
    ? await TimetableSlot.find({
        classRef: { $in: classIds },
        isActive: true,
      })
        .select("_id classRef day startMin endMin")
        .lean()
    : [];

  const groupedByDay = {
    sun: [],
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
  };
  const timetableByClassId = new Map();

  for (const slot of timetableSlots) {
    const key = String(slot?.classRef || "").trim();
    if (!key) continue;
    if (!timetableByClassId.has(key)) {
      timetableByClassId.set(key, []);
    }
    timetableByClassId.get(key).push(slot);
  }

  for (const cls of classes) {
    const timetableDerivedSlots = timetableByClassId.get(String(cls._id)) || [];
    const slots =
      timetableDerivedSlots.length > 0
        ? timetableDerivedSlots
        : Array.isArray(cls.schedule)
        ? cls.schedule
        : [];

    for (const slot of slots) {
      if (!groupedByDay[slot.day]) groupedByDay[slot.day] = [];
      groupedByDay[slot.day].push({
        classId: cls._id,
        subject: cls.subject,
        gradeLevel: cls.gradeLevel,
        teacher: cls.teacher ? { id: cls.teacher._id, name: cls.teacher.name } : null,
        startMin: slot.startMin,
        endMin: slot.endMin,
        startTime: minToHHmm(slot.startMin),
        endTime: minToHHmm(slot.endMin),
      });
    }
  }

  for (const day of Object.keys(groupedByDay)) {
    groupedByDay[day].sort((a, b) => a.startMin - b.startMin);
  }

  return {
    today: toDayKey(),
    groupedByDay,
  };
};
