import ClassModel from "./class.model.js";
import AppError from "../../utils/AppError.js";
import User from "../user/user.model.js";
import mongoose from "mongoose";
import { resolveGradeRef, resolveSubjectRef } from "../../utils/educationRefs.js";
import { Lesson } from "../lessons/lesson.model.js";
import { Assignment } from "../assignment/assignment.model.js";
import { Submission } from "../submisssion/submission.model.js";
import Grade from "../grade/grade.model.js";
import Subject from "../subject/subject.model.js";
import Session from "../session/session.model.js";
import Profile from "../Profile/profile.model.js";
import Attendance from "../attendance/attendance.model.js";
import { buildStudentClassAccessFilterForStudent } from "../../utils/studentClassAccess.js";

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const normalizeDay = (day) => String(day || "").trim().toLowerCase();
const VALID_DAYS = new Set(["sat", "sun", "mon", "tue", "wed", "thu", "fri"]);

const getStudentAssignmentStatus = (submission) => {
  if (!submission) return { myStatus: "pending", myGrade: null };

  const normalizedStatus = String(submission.status || "").trim().toLowerCase();
  if (normalizedStatus === "graded" || submission.grade?.gradedAt) {
    return { myStatus: "graded", myGrade: submission.grade || null };
  }
  if (normalizedStatus === "submitted") {
    return { myStatus: "submitted", myGrade: null };
  }

  return { myStatus: "pending", myGrade: null };
};

const normalize = (v) => String(v || "").trim().toLowerCase();

const mapStoredAttachments = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      originalName: item?.originalName || null,
      mimeType: item?.mimeType || null,
      size: item?.size ?? null,
      storageKey: item?.storageKey || null,
      url: item?.url || null,
    }))
    .filter((item) => item.url || item.storageKey || item.originalName);

const resolveStudentIdsByClasses = async (classes = []) => {
  if (!Array.isArray(classes) || classes.length === 0) return new Map();

  const allGradeIds = new Set();
  const allSubjectIds = new Set();
  for (const cls of classes) {
    if (cls?.gradeId) allGradeIds.add(String(cls.gradeId));
    if (cls?.subjectId) allSubjectIds.add(String(cls.subjectId));
  }

  const [studentsRaw, gradeDocs, subjectDocs] = await Promise.all([
    User.find({ role: "student", status: "active" })
      .select("_id gradeId gradeLevel assignedSubjectIds assignedSubjects status")
      .lean(),
    allGradeIds.size
      ? Grade.find({ _id: { $in: Array.from(allGradeIds) } }).select("_id label name level").lean()
      : [],
    allSubjectIds.size
      ? Subject.find({ _id: { $in: Array.from(allSubjectIds) } }).select("_id name").lean()
      : [],
  ]);

  const gradeLabelById = new Map(
    gradeDocs.map((doc) => [String(doc._id), normalize(doc.label || doc.name || doc.level)])
  );
  const subjectNameById = new Map(subjectDocs.map((doc) => [String(doc._id), normalize(doc.name)]));
  const mergedStudentIdsByClass = new Map();

  for (const cls of classes) {
    mergedStudentIdsByClass.set(String(cls._id), new Set());
  }

  for (const student of studentsRaw) {
    const studentId = String(student?._id || "").trim();
    if (!studentId) continue;

    const studentGradeId = String(student?.gradeId || "").trim();
    const studentGradeCandidates = new Set(
      [normalize(student?.gradeLevel), gradeLabelById.get(studentGradeId)].filter(Boolean)
    );
    const studentSubjectIds = new Set(
      (Array.isArray(student?.assignedSubjectIds) ? student.assignedSubjectIds : []).map((id) =>
        String(id).trim()
      )
    );
    const studentSubjectCandidates = new Set(
      [
        ...(Array.isArray(student?.assignedSubjects) ? student.assignedSubjects : []).map((name) =>
          normalize(name)
        ),
        ...Array.from(studentSubjectIds).map((id) => subjectNameById.get(id)),
      ].filter(Boolean)
    );
    for (const cls of classes) {
      const classGradeId = String(cls?.gradeId || "").trim();
      const classGradeCandidates = new Set(
        [normalize(cls?.gradeLevel), gradeLabelById.get(classGradeId)].filter(Boolean)
      );
      const classSubjectId = String(cls?.subjectId || "").trim();
      const classSubjectCandidates = new Set(
        [normalize(cls?.subject), subjectNameById.get(classSubjectId)].filter(Boolean)
      );

      const gradeMatch =
        (studentGradeId && classGradeId && studentGradeId === classGradeId) ||
        Array.from(classGradeCandidates).some((value) => studentGradeCandidates.has(value));
      if (!gradeMatch) continue;

      const subjectMatch =
        (classSubjectId && studentSubjectIds.has(classSubjectId)) ||
        Array.from(classSubjectCandidates).some((value) => studentSubjectCandidates.has(value));
      if (!subjectMatch) continue;

      mergedStudentIdsByClass.get(String(cls._id))?.add(studentId);
    }
  }

  return mergedStudentIdsByClass;
};

const normalizeScheduleInput = (scheduleInput) => {
  if (!Array.isArray(scheduleInput) || scheduleInput.length === 0) {
    throw new AppError("schedule must be a non-empty array", 400);
  }

  const slots = scheduleInput.map((s) => {
    const day = normalizeDay(s?.day);
    const startMin = typeof s?.startMin === "number" ? s.startMin : toMinutes(s?.startTime);
    const endMin = typeof s?.endMin === "number" ? s.endMin : toMinutes(s?.endTime);

    if (!day) throw new AppError("schedule.day is required", 400);
    if (!VALID_DAYS.has(day)) throw new AppError("schedule.day is invalid", 400);
    if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) {
      throw new AppError("schedule start/end time invalid", 400);
    }
    if (startMin < 0 || endMin > 24 * 60) {
      throw new AppError("schedule time must be within 00:00-24:00", 400);
    }
    if (endMin <= startMin) {
      throw new AppError("schedule end must be greater than start", 400);
    }

    return { day, startMin, endMin };
  });

  return slots;
};

export const createClass = async (payload) => {
  const subjectRef = await resolveSubjectRef({
    subjectId: payload?.subjectId,
    subject: payload?.subject,
    required: true,
  });
  const gradeRef = await resolveGradeRef({
    gradeId: payload?.gradeId,
    gradeLevel: payload?.gradeLevel,
    required: true,
  });
  const subject = String(subjectRef.subject || "").trim();
  const gradeLevel = String(gradeRef.gradeLevel || "").trim();
  const teacherId = payload?.teacher || payload?.teacherId;
  const students = Array.isArray(payload?.students) ? payload.students : [];
  const maxStudents =
    payload?.maxStudents !== undefined
      ? Number(payload.maxStudents)
      : payload?.numberOfStudents !== undefined
      ? Number(payload.numberOfStudents)
      : undefined;
  const status = payload?.status ?? "active";
  const scheduleInput = Array.isArray(payload?.schedule) ? payload.schedule : [];

  if (!subject) throw new AppError("subject is required", 400);
  if (!gradeLevel) throw new AppError("gradeLevel is required", 400);
  if (!teacherId) throw new AppError("teacher is required", 400);

  const teacher = await User.findById(teacherId).lean();
  if (!teacher) throw new AppError("Teacher not found", 404);
  if (teacher.role !== "teacher") throw new AppError("Selected user is not a teacher", 400);

  const teacherSubjectMatch =
    String(teacher.subject || "").trim() === subject ||
    (teacher.subjectId && subjectRef.subjectId
      ? String(teacher.subjectId) === String(subjectRef.subjectId)
      : false);

  if (!teacherSubjectMatch) {
    throw new AppError(`Teacher is assigned to subject "${teacher.subject}", not "${subject}"`, 400);
  }

  const grades = Array.isArray(teacher.assignedGrades) ? teacher.assignedGrades : [];
  const gradeIds = Array.isArray(teacher.assignedGradeIds) ? teacher.assignedGradeIds : [];
  const gradeAllowed =
    grades.includes(gradeLevel) ||
    (gradeRef.gradeId
      ? gradeIds.some((id) => String(id) === String(gradeRef.gradeId))
      : false);

  if (!gradeAllowed) {
    throw new AppError(`Teacher is not assigned to grade "${gradeLevel}"`, 400);
  }

  const schedule = scheduleInput.map((s) => {
    const day = normalizeDay(s?.day);
    const startMin = typeof s?.startMin === "number" ? s.startMin : toMinutes(s?.startTime);
    const endMin = typeof s?.endMin === "number" ? s.endMin : toMinutes(s?.endTime);

    if (!day) throw new AppError("schedule.day is required", 400);
    if (startMin === null || endMin === null) throw new AppError("schedule start/end time invalid", 400);
    if (endMin <= startMin) throw new AppError("schedule end must be greater than start", 400);

    return { day, startMin, endMin };
  });

  for (const slot of schedule) {
    const conflict = await ClassModel.findOne({
      teacher: teacherId,
      status: "active",
      schedule: {
        $elemMatch: {
          day: slot.day,
          startMin: { $lt: slot.endMin },
          endMin: { $gt: slot.startMin },
        },
      },
    }).lean();

    if (conflict) {
      throw new AppError(
        `Teacher already has a class (${conflict.subject} ${conflict.gradeLevel}) at ${slot.day}`,
        409
      );
    }
  }

  try {
    const className =
      String(payload?.className || "").trim() || `${subject} - ${gradeLevel}`;
    return await ClassModel.create({
      className,
      subject,
      subjectId: subjectRef.subjectId || null,
      gradeLevel,
      gradeId: gradeRef.gradeId || null,
      teacher: teacherId,
      teacherName: String(teacher.name || "").trim(),
      students,
      maxStudents: Number.isFinite(maxStudents) ? maxStudents : undefined,
      status,
      schedule,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError("Class already exists for this teacher + grade + subject", 409);
    }
    throw err;
  }
};

export const getMyClasses = async (teacherId) => {
  const classes = await ClassModel.find({ teacher: teacherId, status: "active" })
    .sort({ createdAt: -1 })
    .select(
      "_id className subject subjectId gradeLevel gradeId teacher students maxStudents status schedule createdAt"
    )
    .lean();

  const mergedStudentIdsByClass = await resolveStudentIdsByClasses(classes);

  return classes.map((cls) => ({
    ...cls,
    students: Array.from(mergedStudentIdsByClass.get(String(cls._id)) || []),
    totalStudents: Number(mergedStudentIdsByClass.get(String(cls._id))?.size || 0),
  }));
};

export const listClassesAdmin = async () => {
  return ClassModel.find()
    .sort({ createdAt: -1 })
    .select(
      "_id className subject subjectId gradeLevel gradeId teacher students maxStudents status schedule createdAt"
    );
};

export const getClassById = async (classId, requester = null) => {
  const cls = await ClassModel.findById(classId)
    .select(
      "_id className subject subjectId gradeLevel gradeId teacher teacherName students maxStudents status schedule createdAt"
    )
    .lean();

  if (!cls) throw new AppError("Class not found", 404);
  if (requester?.role === "teacher" && String(cls.teacher) !== String(requester?._id)) {
    throw new AppError("Class not found", 404);
  }

  const [studentsRaw, gradeDocs, subjectDocs, lessons, assignments, sessions, attendanceSheets] = await Promise.all([
    User.find({ role: "student", status: "active" })
      .select("_id gradeId gradeLevel assignedSubjectIds assignedSubjects status")
      .lean(),
    cls?.gradeId
      ? Grade.find({ _id: cls.gradeId }).select("_id label name level").lean()
      : [],
    cls?.subjectId
      ? Subject.find({ _id: cls.subjectId }).select("_id name").lean()
      : [],
    Lesson.find({
      createdBy: cls.teacher,
      gradeId: cls.gradeId || null,
      subjectId: cls.subjectId || null,
      $or: [{ classId }, { classId: null }, { classId: { $exists: false } }],
    })
      .select("_id classId title description contentType chapter date status files createdAt")
      .sort({ date: -1, createdAt: -1 })
      .lean(),
    Assignment.find({
      createdBy: cls.teacher,
      gradeId: cls.gradeId || null,
      subjectId: cls.subjectId || null,
      $or: [{ classId }, { classId: null }, { classId: { $exists: false } }],
      status: { $ne: "draft" },
    })
      .select("_id classId title description dueAt points status attachments createdAt")
      .sort({ dueAt: 1, createdAt: -1 })
      .lean(),
    Session.find({
      teacher: cls.teacher,
      ...(cls?.gradeId ? { gradeId: cls.gradeId } : { grade: cls.gradeLevel }),
      ...(cls?.subjectId ? { subjectId: cls.subjectId } : { subject: cls.subject }),
      $or: [{ classId }, { classId: null }, { classId: { $exists: false } }],
    })
      .select("_id title className classId date time duration zoomLink status subject subjectId grade gradeId createdAt")
      .sort({ date: 1, time: 1, createdAt: -1 })
      .lean(),
    Attendance.find({ classId })
      .select("records")
      .lean(),
  ]);

  const gradeLabelById = new Map(
    gradeDocs.map((doc) => [String(doc._id), normalize(doc.label || doc.name || doc.level)])
  );
  const subjectNameById = new Map(subjectDocs.map((doc) => [String(doc._id), normalize(doc.name)]));
  const mergedStudentIds = new Set();

  for (const student of studentsRaw) {
    const studentId = String(student?._id || "").trim();
    if (!studentId) continue;

    const studentGradeId = String(student?.gradeId || "").trim();
    const studentGradeCandidates = new Set(
      [normalize(student?.gradeLevel), gradeLabelById.get(studentGradeId)].filter(Boolean)
    );
    const studentSubjectIds = new Set(
      (Array.isArray(student?.assignedSubjectIds) ? student.assignedSubjectIds : []).map((id) =>
        String(id).trim()
      )
    );
    const studentSubjectCandidates = new Set(
      [
        ...(Array.isArray(student?.assignedSubjects) ? student.assignedSubjects : []).map((name) =>
          normalize(name)
        ),
        ...Array.from(studentSubjectIds).map((id) => subjectNameById.get(id)),
      ].filter(Boolean)
    );

    const classGradeId = String(cls?.gradeId || "").trim();
    const classGradeCandidates = new Set(
      [normalize(cls?.gradeLevel), gradeLabelById.get(classGradeId)].filter(Boolean)
    );
    const classSubjectId = String(cls?.subjectId || "").trim();
    const classSubjectCandidates = new Set(
      [normalize(cls?.subject), subjectNameById.get(classSubjectId)].filter(Boolean)
    );

    const gradeMatch =
      (studentGradeId && classGradeId && studentGradeId === classGradeId) ||
      Array.from(classGradeCandidates).some((value) => studentGradeCandidates.has(value));
    if (!gradeMatch) continue;

    const subjectMatch =
      (classSubjectId && studentSubjectIds.has(classSubjectId)) ||
      Array.from(classSubjectCandidates).some((value) => studentSubjectCandidates.has(value));
    if (!subjectMatch) continue;

    mergedStudentIds.add(studentId);
  }

  const resolvedStudentIds = Array.from(mergedStudentIds)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const assignmentIds = assignments.map((assignment) => assignment._id);
  const [studentDocs, profileDocs, studentSubmissions] = await Promise.all([
    resolvedStudentIds.length
      ? User.find({ _id: { $in: resolvedStudentIds } })
          .select("_id name phone")
          .sort({ name: 1 })
          .lean()
      : [],
    resolvedStudentIds.length
      ? Profile.find({ user: { $in: resolvedStudentIds } })
          .select("user profileImage")
          .lean()
      : [],
    resolvedStudentIds.length && assignmentIds.length
      ? Submission.find({
          studentId: { $in: resolvedStudentIds },
          assignmentId: { $in: assignmentIds },
        })
          .select("studentId assignmentId grade submittedAt createdAt")
          .sort({ assignmentId: 1, studentId: 1, submittedAt: -1, createdAt: -1 })
          .lean()
      : [],
  ]);

  const assignmentById = new Map(assignments.map((assignment) => [String(assignment._id), assignment]));
  const profileImageByUserId = new Map(
    profileDocs.map((profile) => [String(profile.user), profile.profileImage || null])
  );
  const latestSubmissionByStudentAssignment = new Map();
  for (const submission of studentSubmissions) {
    const key = `${String(submission.studentId)}:${String(submission.assignmentId)}`;
    if (!latestSubmissionByStudentAssignment.has(key)) {
      latestSubmissionByStudentAssignment.set(key, submission);
    }
  }

  const progressByStudentId = new Map();
  for (const submission of latestSubmissionByStudentAssignment.values()) {
    if (!submission?.grade?.gradedAt) continue;
    const sid = String(submission.studentId);
    const assignment = assignmentById.get(String(submission.assignmentId));
    const points = Number(assignment?.points || 0);
    if (points <= 0) continue;
    if (!progressByStudentId.has(sid)) {
      progressByStudentId.set(sid, { score: 0, points: 0 });
    }
    const current = progressByStudentId.get(sid);
    current.score += Number(submission?.grade?.score || 0);
    current.points += points;
  }

  const studentDetails = studentDocs.map((student) => {
    const progress = progressByStudentId.get(String(student._id)) || { score: 0, points: 0 };
    const overallProgress =
      progress.points > 0 ? Math.round((progress.score / progress.points) * 100) : 0;
    return {
      id: student._id,
      name: student.name,
      phone: student.phone || null,
      profileImage: profileImageByUserId.get(String(student._id)) || null,
      overallProgress,
    };
  });

  const avgGrade =
    studentDetails.length > 0
      ? Math.round(
          studentDetails.reduce((sum, student) => sum + Number(student.overallProgress || 0), 0) /
            studentDetails.length
        )
      : 0;

  let attendancePresentLike = 0;
  let attendanceTotal = 0;
  for (const sheet of attendanceSheets) {
    for (const record of Array.isArray(sheet?.records) ? sheet.records : []) {
      attendanceTotal += 1;
      if (record?.status === "Present" || record?.status === "Late") {
        attendancePresentLike += 1;
      }
    }
  }
  const avgAttendance = attendanceTotal > 0 ? Math.round((attendancePresentLike / attendanceTotal) * 100) : 0;

  return {
    ...cls,
    teacherName: String(cls?.teacherName || "").trim() || null,
    students: studentDetails,
    totalStudents: mergedStudentIds.size,
    analytics: {
      avgGrade,
      avgAttendance,
      totalStudents: mergedStudentIds.size,
      totalLessons: lessons.length,
      totalAssignments: assignments.length,
      totalLiveSessions: sessions.length,
    },
    lessonDetails: lessons.map((lesson) => ({
      id: lesson._id,
      classId: lesson.classId || null,
      title: lesson.title,
      description: lesson.description || "",
      contentType: lesson.contentType,
      chapter: lesson.chapter,
      date: lesson.date || null,
      status: lesson.status,
      attachments: mapStoredAttachments(lesson.files),
      createdAt: lesson.createdAt,
    })),
    assignmentDetails: assignments.map((assignment) => ({
      id: assignment._id,
      classId: assignment.classId || null,
      title: assignment.title,
      description: assignment.description || "",
      dueAt: assignment.dueAt,
      points: assignment.points,
      status: assignment.status,
      attachments: mapStoredAttachments(assignment.attachments),
      createdAt: assignment.createdAt,
    })),
    liveSessionDetails: sessions.map((session) => ({
      id: session._id,
      title: session.title,
      classId: session.classId || null,
      className: session.className || null,
      subject: session.subject,
      subjectId: session.subjectId || null,
      grade: session.grade,
      gradeId: session.gradeId || null,
      date: session.date,
      time: session.time,
      duration: session.duration,
      zoomLink: session.zoomLink,
      status: session.status,
      createdAt: session.createdAt,
    })),
  };
};

//  Add new schedule slots (append)
export const addScheduleToClass = async ({ classId, scheduleInput }) => {
  if (!mongoose.Types.ObjectId.isValid(classId)) throw new AppError("Invalid classId", 400);

  const cls = await ClassModel.findById(classId);
  if (!cls) throw new AppError("Class not found", 404);

  const newSlots = normalizeScheduleInput(scheduleInput);

  //  Conflict check: teacher cannot overlap with OTHER classes
  for (const slot of newSlots) {
    const conflict = await ClassModel.findOne({
      _id: { $ne: cls._id },
      teacher: cls.teacher,
      status: "active",
      schedule: {
        $elemMatch: {
          day: slot.day,
          startMin: { $lt: slot.endMin },
          endMin: { $gt: slot.startMin },
        },
      },
    })
      .select("subject gradeLevel")
      .lean();

    if (conflict) {
      throw new AppError(
        `Teacher already has another class (${conflict.subject} ${conflict.gradeLevel}) at ${slot.day}`,
        409
      );
    }
  }

  //  avoid duplicate same slot in same class
  const isSameSlot = (a, b) => a.day === b.day && a.startMin === b.startMin && a.endMin === b.endMin;

  for (const slot of newSlots) {
    if (!cls.schedule.some((s) => isSameSlot(s, slot))) {
      cls.schedule.push(slot);
    }
  }

  await cls.save();
  return cls;
};

//  Replace full schedule (overwrite)
export const replaceClassSchedule = async ({ classId, scheduleInput }) => {
  if (!mongoose.Types.ObjectId.isValid(classId)) throw new AppError("Invalid classId", 400);

  const cls = await ClassModel.findById(classId);
  if (!cls) throw new AppError("Class not found", 404);

  const newSchedule = normalizeScheduleInput(scheduleInput);

  // conflict check with OTHER classes
  for (const slot of newSchedule) {
    const conflict = await ClassModel.findOne({
      _id: { $ne: cls._id },
      teacher: cls.teacher,
      status: "active",
      schedule: {
        $elemMatch: {
          day: slot.day,
          startMin: { $lt: slot.endMin },
          endMin: { $gt: slot.startMin },
        },
      },
    })
      .select("subject gradeLevel")
      .lean();

    if (conflict) {
      throw new AppError(
        `Teacher already has another class (${conflict.subject} ${conflict.gradeLevel}) at ${slot.day}`,
        409
      );
    }
  }

  cls.schedule = newSchedule;
  await cls.save();
  return cls;
};

//  get all classes assigned to the student (enrollment + grade/subject scope)
export const getStudentClasses = async (student) => {
  const classAccessFilter = await buildStudentClassAccessFilterForStudent(student, student._id);

  const classes = await ClassModel.find(classAccessFilter)
    .sort({ subject: 1, createdAt: -1 })
    .select("_id className subject subjectId gradeLevel gradeId teacher teacherName students schedule status createdAt")
    .populate("teacher", "name")
    .lean();

  const mergedStudentIdsByClass = await resolveStudentIdsByClasses(classes);

  const classIds = classes.map((cls) => cls?._id).filter(Boolean);
  const lessonScopePairs = classes
    .filter((cls) => cls?.gradeId && cls?.subjectId)
    .map((cls) => ({ gradeId: cls.gradeId, subjectId: cls.subjectId }));

  const [lessons, assignments] = await Promise.all([
    lessonScopePairs.length
      ? Lesson.find({
          status: "published",
          $or: lessonScopePairs,
        })
          .select("_id classId gradeId subjectId title description contentType chapter date status files createdAt")
          .sort({ date: -1, createdAt: -1 })
          .lean()
      : [],
    classIds.length
      ? Assignment.find({ classId: { $in: classIds }, status: { $ne: "draft" } })
          .select("_id classId title description dueAt points status attachments createdAt")
          .sort({ dueAt: 1, createdAt: -1 })
          .lean()
      : [],
  ]);

  const assignmentIds = assignments.map((assignment) => assignment._id);
  const submissions = assignmentIds.length
    ? await Submission.find({
        assignmentId: { $in: assignmentIds },
        studentId: student._id,
      })
        .select("assignmentId status grade submittedAt")
        .sort({ submittedAt: -1, createdAt: -1 })
        .lean()
    : [];

  const latestSubmissionByAssignmentId = new Map();
  for (const submission of submissions) {
    const key = String(submission.assignmentId);
    if (!latestSubmissionByAssignmentId.has(key)) {
      latestSubmissionByAssignmentId.set(key, submission);
    }
  }

  const lessonsByClassId = new Map();
  for (const lesson of lessons) {
    const lessonGradeId = String(lesson.gradeId || "");
    const lessonSubjectId = String(lesson.subjectId || "");
    for (const cls of classes) {
      if (String(cls.gradeId) !== lessonGradeId || String(cls.subjectId) !== lessonSubjectId) {
        continue;
      }
      const key = String(cls._id);
      if (!lessonsByClassId.has(key)) lessonsByClassId.set(key, []);
      lessonsByClassId.get(key).push({
      id: lesson._id,
      title: lesson.title,
      description: lesson.description || "",
      contentType: lesson.contentType,
      chapter: lesson.chapter,
      date: lesson.date || null,
      status: lesson.status,
      attachments: mapStoredAttachments(lesson.files),
      createdAt: lesson.createdAt,
      });
    }
  }

  const assignmentsByClassId = new Map();
  for (const assignment of assignments) {
    const key = String(assignment.classId || "").trim();
    if (!key) continue;
    if (!assignmentsByClassId.has(key)) assignmentsByClassId.set(key, []);
    const { myStatus, myGrade } = getStudentAssignmentStatus(
      latestSubmissionByAssignmentId.get(String(assignment._id))
    );
    assignmentsByClassId.get(key).push({
      id: assignment._id,
      title: assignment.title,
      description: assignment.description || "",
      dueAt: assignment.dueAt,
      points: assignment.points,
      status: assignment.status,
      attachments: mapStoredAttachments(assignment.attachments),
      myStatus,
      myGrade,
      createdAt: assignment.createdAt,
    });
  }

  return classes.map((cls) => ({
    ...cls,
    teacher: cls?.teacher?._id || cls?.teacher || null,
    teacherName:
      cls?.teacher && typeof cls.teacher === "object" && cls.teacher.name
        ? String(cls.teacher.name).trim()
        : null,
    students: Array.from(mergedStudentIdsByClass.get(String(cls._id)) || []),
    totalStudents: Number(mergedStudentIdsByClass.get(String(cls._id))?.size || 0),
    lessonDetails: lessonsByClassId.get(String(cls._id)) || [],
    assignmentDetails: assignmentsByClassId.get(String(cls._id)) || [],
  }));
};

export const getStudentClassById = async (student, classId) => {
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw new AppError("Invalid classId", 400);
  }

  const classes = await getStudentClasses(student);
  const cls = classes.find((item) => String(item._id) === String(classId));

  if (!cls) {
    throw new AppError("Class not found for this student", 404);
  }

  return cls;
};
