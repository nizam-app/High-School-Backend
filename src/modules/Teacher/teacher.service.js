import mongoose from "mongoose";
import AppError from "../../utils/AppError.js";
import ClassModel from "../class/class.model.js";
import Session from "../session/session.model.js";
import { Assignment } from "../assignment/assignment.model.js";
import { Submission } from "../submisssion/submission.model.js";
import User from "../user/user.model.js";
import Attendance from "../attendance/attendance.model.js";
import Grade from "../grade/grade.model.js";
import Subject from "../subject/subject.model.js";
const norm = (v) => String(v || "").trim().toLowerCase();
const round2 = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date = new Date()) => {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
};

const normalizeStatus = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (v === "present") return "Present";
  if (v === "absent") return "Absent";
  if (v === "late") return "Late";
  return "";
};

const buildTeacherStudentClassMaps = async (teacherId) => {
  const classes = await ClassModel.find({ teacher: teacherId, status: "active" })
    .select("_id subject subjectId gradeLevel gradeId students")
    .lean();

  const classById = new Map(classes.map((cls) => [String(cls._id), cls]));
  const studentClassMap = new Map();
  for (const cls of classes) {
    for (const sid of cls.students || []) {
      const key = String(sid);
      if (!studentClassMap.has(key)) studentClassMap.set(key, []);
      studentClassMap.get(key).push(cls);
    }
  }

  const allGradeIds = new Set();
  const allSubjectIds = new Set();
  for (const cls of classes) {
    if (cls?.gradeId) allGradeIds.add(String(cls.gradeId));
    if (cls?.subjectId) allSubjectIds.add(String(cls.subjectId));
  }

  const [studentsRaw, gradeDocs, subjectDocs] = await Promise.all([
    User.find({ role: "student", status: "active" })
      .select("_id gradeId gradeLevel assignedSubjectIds assignedSubjects")
      .lean(),
    allGradeIds.size
      ? Grade.find({ _id: { $in: Array.from(allGradeIds) } }).select("_id label name level").lean()
      : [],
    allSubjectIds.size
      ? Subject.find({ _id: { $in: Array.from(allSubjectIds) } }).select("_id name").lean()
      : [],
  ]);

  const gradeLabelById = new Map(
    gradeDocs.map((doc) => [String(doc._id), norm(doc.label || doc.name || doc.level)])
  );
  const subjectNameById = new Map(subjectDocs.map((doc) => [String(doc._id), norm(doc.name)]));

  for (const student of studentsRaw) {
    const studentId = String(student?._id || "").trim();
    if (!studentId) continue;

    const studentGradeId = String(student?.gradeId || "").trim();
    const studentGradeCandidates = new Set(
      [norm(student?.gradeLevel), gradeLabelById.get(studentGradeId)].filter(Boolean)
    );
    const studentSubjectIds = new Set(
      (Array.isArray(student?.assignedSubjectIds) ? student.assignedSubjectIds : []).map((id) =>
        String(id).trim()
      )
    );
    const studentSubjectCandidates = new Set(
      [
        ...(Array.isArray(student?.assignedSubjects) ? student.assignedSubjects : []).map((name) =>
          norm(name)
        ),
        ...Array.from(studentSubjectIds).map((id) => subjectNameById.get(id)),
      ].filter(Boolean)
    );

    for (const cls of classes) {
      const classGradeId = String(cls?.gradeId || "").trim();
      const classGradeCandidates = new Set(
        [norm(cls?.gradeLevel), gradeLabelById.get(classGradeId)].filter(Boolean)
      );
      const classSubjectId = String(cls?.subjectId || "").trim();
      const classSubjectCandidates = new Set(
        [norm(cls?.subject), subjectNameById.get(classSubjectId)].filter(Boolean)
      );

      const gradeMatch =
        (studentGradeId && classGradeId && studentGradeId === classGradeId) ||
        Array.from(classGradeCandidates).some((value) => studentGradeCandidates.has(value));
      if (!gradeMatch) continue;

      const subjectMatch =
        (classSubjectId && studentSubjectIds.has(classSubjectId)) ||
        Array.from(classSubjectCandidates).some((value) => studentSubjectCandidates.has(value));
      if (!subjectMatch) continue;

      if (!studentClassMap.has(studentId)) studentClassMap.set(studentId, []);
      const currentClasses = studentClassMap.get(studentId);
      if (!currentClasses.some((existing) => String(existing._id) === String(cls._id))) {
        currentClasses.push(cls);
      }
    }
  }

  return {
    classes,
    classById,
    studentClassMap,
  };
};

const assignmentMatchesClassScope = (assignment, cls) => {
  if (!assignment || !cls) return false;

  if (assignment.classId && String(assignment.classId) === String(cls._id)) return true;

  const assignmentGradeIds = new Set(
    [assignment.gradeId, assignment.classInfo?.gradeId].filter(Boolean).map((id) => String(id))
  );
  const assignmentGradeNames = new Set(
    [assignment.classInfo?.gradeLevel].map((value) => norm(value)).filter(Boolean)
  );
  const assignmentSubjectIds = new Set(
    [assignment.subjectId, assignment.classInfo?.subjectId].filter(Boolean).map((id) => String(id))
  );
  const assignmentSubjectNames = new Set(
    [assignment.classInfo?.subject].map((value) => norm(value)).filter(Boolean)
  );

  const classGradeId = String(cls?.gradeId || "").trim();
  const classSubjectId = String(cls?.subjectId || "").trim();
  const gradeMatch =
    (classGradeId && assignmentGradeIds.has(classGradeId)) ||
    assignmentGradeNames.has(norm(cls?.gradeLevel));
  const subjectMatch =
    (classSubjectId && assignmentSubjectIds.has(classSubjectId)) ||
    assignmentSubjectNames.has(norm(cls?.subject));

  return gradeMatch && subjectMatch;
};

const ensureStudentInTeacherClass = async (teacherId, studentId, classId = null) => {
  const filter = {
    teacher: teacherId,
    students: studentId,
    status: "active",
  };
  if (classId) filter._id = classId;

  const classes = await ClassModel.find(filter)
    .select("_id subject gradeLevel students")
    .lean();
  if (!classes.length) {
    throw new AppError("Student is not assigned to your class", 403);
  }
  return classes;
};

const pickLatestSubmissions = (subs = []) => {
  const map = new Map();
  for (const sub of subs) {
    const key = `${String(sub.assignmentId)}:${String(sub.studentId)}`;
    const prev = map.get(key);
    if (!prev || new Date(sub.submittedAt) > new Date(prev.submittedAt)) {
      map.set(key, sub);
    }
  }
  return Array.from(map.values());
};

export const getTeacherDashboard = async (teacherId) => {
  const [classes, assignments, sessions] = await Promise.all([
    ClassModel.find({ teacher: teacherId, status: "active" })
      .select("_id subject gradeLevel students schedule")
      .lean(),
    Assignment.find({ createdBy: teacherId })
      .select("_id title classId dueAt status points createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    Session.find({ teacher: teacherId })
      .select("_id title subject date time status createdAt")
      .sort({ date: 1, time: 1 })
      .lean(),
  ]);

  const uniqueStudents = new Set();
  for (const cls of classes) {
    for (const sid of cls.students || []) uniqueStudents.add(String(sid));
  }

  const assignmentIds = assignments.map((a) => a._id);
  const submissions = assignmentIds.length
    ? await Submission.find({ assignmentId: { $in: assignmentIds } })
        .select("assignmentId studentId submittedAt grade status")
        .populate("studentId", "name")
        .lean()
    : [];
  const latestSubs = pickLatestSubmissions(submissions);

  const pendingGrading = latestSubs.filter((s) => !s.grade?.gradedAt).length;
  const graded = latestSubs.filter((s) => !!s.grade?.gradedAt).length;

  const todayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  const todaysClasses = [];
  for (const cls of classes) {
    for (const slot of cls.schedule || []) {
      if (slot.day !== todayKey) continue;
      todaysClasses.push({
        classId: cls._id,
        subject: cls.subject,
        gradeLevel: cls.gradeLevel,
        studentsCount: (cls.students || []).length,
        startMin: slot.startMin,
        endMin: slot.endMin,
      });
    }
  }
  todaysClasses.sort((a, b) => a.startMin - b.startMin);

  const now = new Date();
  const upcomingLiveSessions = sessions
    .filter((s) => ["approved", "ongoing"].includes(String(s.status || "").toLowerCase()))
    .slice(0, 5);

  const recentSubmissions = latestSubs
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .slice(0, 5)
    .map((s) => ({
      assignmentId: s.assignmentId,
      student: s.studentId ? { id: s.studentId._id, name: s.studentId.name } : null,
      submittedAt: s.submittedAt,
      graded: !!s.grade?.gradedAt,
    }));

  return {
    cards: {
      myClasses: classes.length,
      totalStudents: uniqueStudents.size,
      pendingGrading,
      graded,
    },
    todaysClasses,
    upcomingLiveSessions,
    recentSubmissions,
    myClassesPreview: classes.slice(0, 5).map((c) => ({
      id: c._id,
      subject: c.subject,
      gradeLevel: c.gradeLevel,
      studentsCount: (c.students || []).length,
    })),
  };
};

export const listTeacherStudents = async (teacherId, query = {}) => {
  const { classes, studentClassMap } = await buildTeacherStudentClassMaps(teacherId);

  const studentIds = Array.from(studentClassMap.keys());
  if (!studentIds.length) {
    return {
      data: [],
      teacherOverview: {
        total: 0,
        totalClasses: classes.length,
        averageStudentsScorePercentage: 0,
      },
    };
  }

  const search = String(query.search || "").trim();
  const filter = { _id: { $in: studentIds } };
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const students = await User.find(filter)
    .select("_id name email phone assignedSubjects assignedSubjectIds gradeLevel gradeId")
    .sort({ name: 1 })
    .lean();

  const availableClassesByGradeLevel = new Map();
  const availableClassDetailsByGradeLevel = new Map();
  const availableClasses = await ClassModel.find({ status: "active" })
    .select("_id subject gradeLevel")
    .lean();
  for (const cls of availableClasses) {
    const gradeLevelKey = norm(cls?.gradeLevel);
    if (!gradeLevelKey) continue;
    const details = {
      classId: cls._id,
      subject: cls.subject,
      gradeLevel: cls.gradeLevel,
    };
    if (!availableClassDetailsByGradeLevel.has(gradeLevelKey)) {
      availableClassDetailsByGradeLevel.set(gradeLevelKey, []);
    }
    availableClassDetailsByGradeLevel.get(gradeLevelKey).push(details);
  }
  for (const [gradeLevelKey, details] of availableClassDetailsByGradeLevel.entries()) {
    availableClassesByGradeLevel.set(gradeLevelKey, details.length);
  }

  const gradeIdsForLookup = Array.from(
    new Set(
      students
        .map((student) => String(student?.gradeId || "").trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )
  ).map((id) => new mongoose.Types.ObjectId(id));

  const gradeDocs = gradeIdsForLookup.length
    ? await Grade.find({ _id: { $in: gradeIdsForLookup } }).select("_id label name level").lean()
    : [];
  const gradeLabelById = new Map(
    gradeDocs.map((doc) => [
      String(doc._id),
      norm(doc?.label || doc?.name || doc?.level),
    ])
  );

  const assignments = await Assignment.find({
    createdBy: teacherId,
    status: { $ne: "draft" },
  })
    .select("_id title dueAt points classId gradeId subjectId classInfo")
    .lean();
  const assignmentIds = assignments.map((a) => a._id);

  const studentObjectIds = students.map((s) => s._id);
  const [submissions, attendanceSheets] = await Promise.all([
    assignmentIds.length
      ? Submission.find({
          assignmentId: { $in: assignmentIds },
          studentId: { $in: studentObjectIds },
        })
          .select("assignmentId studentId submittedAt createdAt grade status")
          .sort({ submittedAt: -1, createdAt: -1 })
          .lean()
      : [],
    studentObjectIds.length
      ? Attendance.find({
          teacherId,
          "records.studentId": { $in: studentObjectIds },
        })
          .select("date records")
          .sort({ date: -1 })
          .lean()
      : [],
  ]);

  const latestSubs = pickLatestSubmissions(submissions);
  const latestSubmissionByStudentAssignment = new Map(
    latestSubs.map((sub) => [`${String(sub.studentId)}:${String(sub.assignmentId)}`, sub])
  );

  const attendanceByStudentId = new Map();
  for (const sheet of attendanceSheets) {
    for (const record of Array.isArray(sheet?.records) ? sheet.records : []) {
      const sid = String(record?.studentId || "");
      if (!sid || !studentClassMap.has(sid)) continue;
      if (!attendanceByStudentId.has(sid)) {
        attendanceByStudentId.set(sid, {
          present: 0,
          absent: 0,
          late: 0,
          total: 0,
          recentRecords: [],
        });
      }
      const current = attendanceByStudentId.get(sid);
      if (record.status === "Present") current.present += 1;
      if (record.status === "Absent") current.absent += 1;
      if (record.status === "Late") current.late += 1;
      current.total += 1;
      current.recentRecords.push({
        date: sheet.date,
        status: record.status,
      });
    }
  }

  const data = students.map((s) => {
    const cls = studentClassMap.get(String(s._id)) || [];
    const relevantAssignments = assignments.filter((assignment) =>
      cls.some((classDoc) => assignmentMatchesClassScope(assignment, classDoc))
    );

    let totalScore = 0;
    let totalPoints = 0;
    let submittedAssignments = 0;
    let gradedAssignments = 0;
    let rawScoreSum = 0;

    const assignmentProgress = relevantAssignments.map((assignment) => {
      const submission = latestSubmissionByStudentAssignment.get(
        `${String(s._id)}:${String(assignment._id)}`
      );

      let status = "pending";
      if (submission) {
        status = submission.grade?.gradedAt ? "graded" : "submitted";
        submittedAssignments += 1;
      }
      if (submission?.grade?.gradedAt) {
        totalScore += Number(submission.grade?.score || 0);
        totalPoints += Number(assignment.points || 0);
        gradedAssignments += 1;
        rawScoreSum += Number(submission.grade?.score || 0);
      }

      return {
        assignmentId: assignment._id,
        title: assignment.title,
        dueAt: assignment.dueAt,
        points: assignment.points,
        status,
        score: submission?.grade?.score ?? null,
        feedback: submission?.grade?.feedback ?? null,
        submittedAt: submission?.submittedAt || null,
      };
    });

    const attendance = attendanceByStudentId.get(String(s._id)) || {
      present: 0,
      absent: 0,
      late: 0,
      total: 0,
      recentRecords: [],
    };
    const attendanceRate =
      attendance.total > 0 ? Math.round(((attendance.present + attendance.late) / attendance.total) * 100) : 0;
    const overallGrade = totalPoints > 0 ? Math.round((totalScore / totalPoints) * 100) : 0;
    const averageAssignmentScore = totalPoints > 0 ? round2((totalScore / totalPoints) * 100) : 0;
    const averageAssignmentRawScore = gradedAssignments > 0 ? round2(rawScoreSum / gradedAssignments) : 0;
    const studentGradeId = String(s?.gradeId || "").trim();
    const studentGradeLevel = norm(s?.gradeLevel) || gradeLabelById.get(studentGradeId) || "";
    const totalAvailableClassesForGrade = availableClassesByGradeLevel.get(studentGradeLevel) || 0;
    const totalAvailableClassesForGradeDetails =
      availableClassDetailsByGradeLevel.get(studentGradeLevel) || [];
    const lastSubmissionDate = assignmentProgress
      .map((item) => item.submittedAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;
    const lastAttendanceDate = attendance.recentRecords
      .map((item) => item.date)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;
    const lastActivity =
      [lastSubmissionDate, lastAttendanceDate]
        .filter(Boolean)
        .map((date) => new Date(date))
        .sort((a, b) => b - a)[0] || null;

    return {
      id: s._id,
      name: s.name,
      email: s.email || null,
      phone: s.phone || null,
      gradeLevel: s.gradeLevel || null,
      subjects: Array.isArray(s.assignedSubjects) ? s.assignedSubjects : [],
      avgGrade: overallGrade,
      averageAssignmentScore,
      totalAvailableClassesForGrade,
      totalAvailableClassesForGradeDetails,
      performanceOverview: {
        overallGrade,
        averageAssignmentScore,
        averageAssignmentRawScore,
        totalAvailableClassesForGrade,
        assignedClassesCount: cls.length,
        assignmentCompletion: `${submittedAssignments}/${relevantAssignments.length || 0}`,
        attendanceRate,
        lastActivity,
        gradedAssignments,
        totalAssignments: relevantAssignments.length,
      },
      assignmentProgress,
    };
  });

  if (data.length) {
    await User.bulkWrite(
      data.map((student) => ({
        updateOne: {
          filter: { _id: student.id, role: "student" },
          update: {
            $set: {
              studentMetrics: {
                totalAvailableClassesForGrade: Number(student.totalAvailableClassesForGrade || 0),
                averageAssignmentScore: Number(student.averageAssignmentScore || 0),
                averageAssignmentRawScore: Number(
                  student?.performanceOverview?.averageAssignmentRawScore || 0
                ),
                gradedAssignmentsCount: Number(student?.performanceOverview?.gradedAssignments || 0),
                updatedAt: new Date(),
              },
            },
          },
        },
      })),
      { ordered: false }
    );
  }

  const averageStudentsScorePercentage = data.length
    ? round2(
        data.reduce((sum, student) => sum + Number(student?.avgGrade || 0), 0) / data.length
      )
    : 0;
  const teacherOverview = {
    total: data.length,
    totalClasses: classes.length,
    averageStudentsScorePercentage,
  };

  return {
    data,
    teacherOverview,
  };
};

export const getTeacherStudentById = async (teacherId, studentId) => {
  if (!mongoose.Types.ObjectId.isValid(String(studentId || "").trim())) {
    throw new AppError("Invalid student id", 400);
  }

  const result = await listTeacherStudents(teacherId, {});
  const student = (result?.data || []).find((item) => String(item?.id) === String(studentId));

  if (!student) {
    throw new AppError("Student not found in your accessible students", 404);
  }

  return student;
};

export const listTeachersForAdmin = async (query = {}) => {
  const search = String(query.search || "").trim();
  const filter = {
    role: "teacher",
    status: "active",
  };

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { phone: rx }, { email: rx }, { subject: rx }];
  }

  const teachers = await User.find(filter)
    .select("_id name phone email subject subjectId assignedGrades assignedGradeIds status")
    .sort({ name: 1 })
    .lean();

  return teachers.map((t) => ({
    id: t._id,
    name: t.name,
    phone: t.phone || null,
    email: t.email || null,
    subject: t.subject || null,
    subjectId: t.subjectId || null,
    assignedGrades: Array.isArray(t.assignedGrades) ? t.assignedGrades : [],
    assignedGradeIds: Array.isArray(t.assignedGradeIds) ? t.assignedGradeIds : [],
    status: t.status,
  }));
};

export const getTeacherStudentsStats = async (teacherId, query = {}) => {
  const subject = String(query.subject || "").trim();
  const gradeLevel = String(query.gradeLevel || "").trim();
  const search = String(query.search || "").trim();

  const result = await listTeacherStudents(teacherId, { search });
  let filtered = Array.isArray(result.data) ? result.data : [];

  if (subject || gradeLevel) {
    filtered = filtered.filter((student) =>
      (student.totalAvailableClassesForGradeDetails || []).some((cls) => {
        const subjectOk = subject ? norm(cls.subject) === norm(subject) : true;
        const gradeOk = gradeLevel ? norm(cls.gradeLevel) === norm(gradeLevel) : true;
        return subjectOk && gradeOk;
      })
    );
  }

  return {
    totalStudents: filtered.length,
    subject: subject || null,
    gradeLevel: gradeLevel || null,
    students: filtered.map((s) => ({
      id: s.id,
      name: s.name,
      avgGrade: s.avgGrade,
      gradeLevel: s.gradeLevel,
      totalAvailableClassesForGradeDetails: s.totalAvailableClassesForGradeDetails || [],
    })),
  };
};

export const getTeacherStudentProgress = async (teacherId, studentId, classId = null) => {
  const classes = await ensureStudentInTeacherClass(teacherId, studentId, classId);
  const classIds = classes.map((c) => c._id);

  const [student, assignments, submissions] = await Promise.all([
    User.findById(studentId).select("_id name email").lean(),
    Assignment.find({
      createdBy: teacherId,
      ...(classId ? { classId } : { classId: { $in: classIds } }),
    })
      .select("_id title dueAt points classId")
      .sort({ dueAt: 1 })
      .lean(),
    Submission.find({ studentId })
      .select("assignmentId studentId submittedAt grade status")
      .lean(),
  ]);

  if (!student) throw new AppError("Student not found", 404);

  const assignmentMap = new Map(assignments.map((a) => [String(a._id), a]));
  const subsForTeacher = submissions.filter((s) => assignmentMap.has(String(s.assignmentId)));
  const latestSubs = pickLatestSubmissions(subsForTeacher);
  const subByAssignment = new Map(latestSubs.map((s) => [String(s.assignmentId), s]));

  let totalScore = 0;
  let totalPoints = 0;
  let gradedAssignments = 0;
  let submittedAssignments = 0;
  const assignmentProgress = assignments.map((a) => {
    const sub = subByAssignment.get(String(a._id));
    let status = "pending";
    if (sub) {
      status = sub.grade?.gradedAt ? "graded" : "submitted";
      submittedAssignments += 1;
    }
    if (sub?.grade?.gradedAt) {
      totalScore += Number(sub.grade?.score || 0);
      totalPoints += Number(a.points || 0);
      gradedAssignments += 1;
    }
    return {
      assignmentId: a._id,
      title: a.title,
      dueAt: a.dueAt,
      points: a.points,
      status,
      score: sub?.grade?.score ?? null,
    };
  });

  const attendance = await getTeacherStudentAttendance(teacherId, studentId, classId);

  const overallGrade = totalPoints > 0 ? Math.round((totalScore / totalPoints) * 100) : 0;
  const assignmentCompletion = `${submittedAssignments}/${assignments.length || 0}`;
  const lastSubmissionDate =
    latestSubs.length > 0
      ? latestSubs.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0].submittedAt
      : null;
  const lastAttendanceDate = attendance.recentRecords[0]?.date || null;
  const lastActivity =
    [lastSubmissionDate, lastAttendanceDate]
      .filter(Boolean)
      .map((d) => new Date(d))
      .sort((a, b) => b - a)[0] || null;

  return {
    student,
    selectedClassId: classId || null,
    performanceOverview: {
      overallGrade,
      assignmentCompletion,
      attendanceRate: attendance.summary.attendanceRate,
      lastActivity,
      gradedAssignments,
      totalAssignments: assignments.length,
    },
    attendanceTracking: attendance,
    assignmentProgress,
  };
};

export const getTeacherStudentAttendance = async (teacherId, studentId, classId = null) => {
  const classes = await ensureStudentInTeacherClass(teacherId, studentId, classId);
  const classIds = classes.map((c) => c._id);

  const sheets = await Attendance.find({
    teacherId,
    classId: { $in: classIds },
    "records.studentId": studentId,
  })
    .sort({ date: -1 })
    .lean();

  const recentRecords = [];
  let present = 0;
  let absent = 0;
  let late = 0;
  for (const sheet of sheets) {
    const record = (sheet.records || []).find((r) => String(r.studentId) === String(studentId));
    if (!record) continue;
    if (record.status === "Present") present += 1;
    if (record.status === "Absent") absent += 1;
    if (record.status === "Late") late += 1;
    recentRecords.push({
      classId: sheet.classId,
      date: sheet.date,
      status: record.status,
    });
  }

  const total = present + absent + late;
  const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  return {
    summary: {
      present,
      absent,
      late,
      total,
      attendanceRate,
    },
    recentRecords: recentRecords.slice(0, 10),
  };
};

export const markTeacherStudentAttendance = async (teacherId, studentId, payload = {}) => {
  const classId = String(payload.classId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(classId)) throw new AppError("classId is required", 400);

  await ensureStudentInTeacherClass(teacherId, studentId, classId);

  const status = normalizeStatus(payload.status);
  if (!status) throw new AppError("status must be Present/Absent/Late", 400);

  const date = payload.date ? new Date(payload.date) : new Date();
  if (Number.isNaN(date.getTime())) throw new AppError("Invalid date", 400);
  const dayStart = startOfDay(date);

  let sheet = await Attendance.findOne({ classId, date: dayStart });
  if (!sheet) {
    try {
      sheet = await Attendance.create({
        classId,
        teacherId,
        date: dayStart,
        records: [{ studentId, status }],
      });
    } catch (err) {
      if (err?.code === 11000) {
        sheet = await Attendance.findOne({ classId, date: dayStart });
      } else {
        throw err;
      }
    }
  }

  if (!sheet) throw new AppError("Could not mark attendance", 500);

  const idx = (sheet.records || []).findIndex((r) => String(r.studentId) === String(studentId));
  if (idx === -1) {
    sheet.records.push({ studentId, status });
  } else {
    sheet.records[idx].status = status;
  }
  sheet.teacherId = teacherId;
  await sheet.save();

  const attendance = await getTeacherStudentAttendance(teacherId, studentId, classId);
  return {
    date: dayStart,
    classId,
    studentId,
    status,
    attendance,
  };
};
