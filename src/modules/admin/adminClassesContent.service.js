import mongoose from "mongoose";
import AppError from "../../utils/AppError.js";
import ClassModel from "../class/class.model.js";
import User from "../user/user.model.js";
import { Lesson } from "../lessons/lesson.model.js";
import { Assignment } from "../assignment/assignment.model.js";
import { Subject } from "../subject/subject.model.js";
import { Grade } from "../grade/grade.model.js";
import { TimetableSlot } from "../timetable/timetableSlot.model.js";
import { resolveGradeRef, resolveSubjectRef } from "../../utils/educationRefs.js";

const normalize = (v) => String(v || "").trim();
const normalizeLower = (v) => normalize(v).toLowerCase();

const normalizeClassStatus = (value) => {
  const v = normalizeLower(value);
  if (!v) return "active";
  if (v === "active") return "active";
  if (v === "archived") return "archived";
  throw new AppError("Invalid status. Use Active or Archived", 400);
};

const resolveClassName = ({ className, subject, gradeLevel }) => {
  const name = normalize(className);
  if (name) return name;
  return `${normalize(subject)} - ${normalize(gradeLevel)}`;
};

const parseBool = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const x = String(v).trim().toLowerCase();
  return ["true", "1", "yes"].includes(x);
};

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const buildScopeKey = (teacherId, gradeId, subjectId) =>
  `${String(teacherId || "").trim()}__${String(gradeId || "").trim()}__${String(subjectId || "").trim()}`;

const findTeacherForScope = async ({ subjectRef, gradeRef }) => {
  const teachers = await User.find({ role: "teacher", status: "active" })
    .select("_id subject subjectId assignedGrades assignedGradeIds")
    .lean();

  for (const teacher of teachers) {
    const subjectMatch =
      normalize(teacher.subject) === normalize(subjectRef.subject) ||
      (teacher.subjectId && subjectRef.subjectId
        ? String(teacher.subjectId) === String(subjectRef.subjectId)
        : false);
    if (!subjectMatch) continue;

    const gradeLabels = Array.isArray(teacher.assignedGrades) ? teacher.assignedGrades : [];
    const gradeIds = Array.isArray(teacher.assignedGradeIds) ? teacher.assignedGradeIds : [];
    const gradeMatch =
      gradeLabels.includes(gradeRef.gradeLevel) ||
      (gradeRef.gradeId
        ? gradeIds.some((id) => String(id) === String(gradeRef.gradeId))
        : false);
    if (gradeMatch) return teacher;
  }

  return null;
};

const validateTeacherAssignment = async ({ teacherId, subjectRef, gradeRef }) => {
  if (!teacherId) throw new AppError("teacherId is required", 400);
  if (!mongoose.Types.ObjectId.isValid(String(teacherId))) {
    throw new AppError("Invalid teacherId", 400);
  }

  const teacher = await User.findById(teacherId).lean();
  if (!teacher) throw new AppError("Teacher not found", 404);
  if (teacher.role !== "teacher") throw new AppError("Selected user is not a teacher", 400);

  const teacherSubjectMatch =
    normalize(teacher.subject) === normalize(subjectRef.subject) ||
    (teacher.subjectId && subjectRef.subjectId
      ? String(teacher.subjectId) === String(subjectRef.subjectId)
      : false);

  if (!teacherSubjectMatch) {
    throw new AppError(
      `Teacher is assigned to subject "${teacher.subject || "N/A"}", not "${subjectRef.subject}"`,
      400
    );
  }

  const gradeLabels = Array.isArray(teacher.assignedGrades) ? teacher.assignedGrades : [];
  const gradeIds = Array.isArray(teacher.assignedGradeIds) ? teacher.assignedGradeIds : [];
  const gradeMatch =
    gradeLabels.includes(gradeRef.gradeLevel) ||
    (gradeRef.gradeId
      ? gradeIds.some((id) => String(id) === String(gradeRef.gradeId))
      : false);

  if (!gradeMatch) {
    throw new AppError(`Teacher is not assigned to grade "${gradeRef.gradeLevel}"`, 400);
  }

  return teacher;
};

export const listAdminClasses = async (query = {}) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 20), 100);
  const skip = (page - 1) * limit;

  const filter = {};

  if (query.status) {
    const status = normalize(query.status).toLowerCase();
    if (status !== "all") filter.status = status;
  }

  if (query.teacherId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.teacherId))) {
      throw new AppError("Invalid teacherId filter", 400);
    }
    filter.teacher = query.teacherId;
  }

  if (query.subjectId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.subjectId))) {
      throw new AppError("Invalid subjectId filter", 400);
    }
    filter.subjectId = query.subjectId;
  }

  if (query.gradeId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.gradeId))) {
      throw new AppError("Invalid gradeId filter", 400);
    }
    filter.gradeId = query.gradeId;
  }

  if (query.search) {
    const q = normalize(query.search);
    const regex = new RegExp(escapeRegex(q), "i");

    const matchingTeachers = await User.find({
      role: "teacher",
      name: regex,
    })
      .select("_id")
      .lean();

    const teacherIds = matchingTeachers.map((t) => t._id);

    filter.$or = [{ subject: regex }, { gradeLevel: regex }];
    if (teacherIds.length) filter.$or.push({ teacher: { $in: teacherIds } });
  }

  const [total, classes] = await Promise.all([
    ClassModel.countDocuments(filter),
    ClassModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("teacher", "name phone email")
      .lean(),
  ]);

  const classIds = classes.map((c) => c._id);
  const teacherIds = classes
    .map((c) => c?.teacher?._id || c?.teacher || null)
    .filter(Boolean);
  const gradeIds = classes.map((c) => c?.gradeId || null).filter(Boolean);
  const subjectIds = classes.map((c) => c?.subjectId || null).filter(Boolean);
  const [lessonCountsRaw, assignmentCountsRaw, unlinkedLessonCountsRaw, unlinkedAssignmentCountsRaw, studentsRaw] = await Promise.all([
    Lesson.aggregate([
      { $match: { classId: { $in: classIds } } },
      { $group: { _id: "$classId", count: { $sum: 1 } } },
    ]),
    Assignment.aggregate([
      { $match: { classId: { $in: classIds } } },
      { $group: { _id: "$classId", count: { $sum: 1 } } },
    ]),
    Lesson.aggregate([
      {
        $match: {
          createdBy: { $in: teacherIds },
          gradeId: { $in: gradeIds },
          subjectId: { $in: subjectIds },
          $or: [{ classId: null }, { classId: { $exists: false } }],
        },
      },
      {
        $group: {
          _id: {
            createdBy: "$createdBy",
            gradeId: "$gradeId",
            subjectId: "$subjectId",
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Assignment.aggregate([
      {
        $match: {
          createdBy: { $in: teacherIds },
          gradeId: { $in: gradeIds },
          subjectId: { $in: subjectIds },
          $or: [{ classId: null }, { classId: { $exists: false } }],
        },
      },
      {
        $group: {
          _id: {
            createdBy: "$createdBy",
            gradeId: "$gradeId",
            subjectId: "$subjectId",
          },
          count: { $sum: 1 },
        },
      },
    ]),
    User.find({ role: "student" })
      .select("_id gradeId gradeLevel assignedSubjectIds assignedSubjects status")
      .lean(),
  ]);

  const timetableSlots = classIds.length
    ? await TimetableSlot.find({
        classRef: { $in: classIds },
        isActive: true,
      })
        .sort({ day: 1, startMin: 1, endMin: 1 })
        .select("_id classRef day startMin endMin room type isActive")
        .lean()
    : [];

  const lessonCounts = new Map(lessonCountsRaw.map((x) => [String(x._id), x.count]));
  const assignmentCounts = new Map(assignmentCountsRaw.map((x) => [String(x._id), x.count]));
  const timetableByClassId = new Map();
  for (const slot of timetableSlots) {
    const key = String(slot.classRef || "").trim();
    if (!key) continue;
    if (!timetableByClassId.has(key)) {
      timetableByClassId.set(key, []);
    }
    timetableByClassId.get(key).push({
      id: slot._id,
      day: slot.day,
      startMin: slot.startMin,
      endMin: slot.endMin,
      room: slot.room || "",
      type: slot.type,
      isActive: slot.isActive,
      source: "timetable",
    });
  }
  const unlinkedLessonCounts = new Map(
    unlinkedLessonCountsRaw.map((x) => [
      buildScopeKey(x?._id?.createdBy, x?._id?.gradeId, x?._id?.subjectId),
      Number(x?.count || 0),
    ])
  );
  const unlinkedAssignmentCounts = new Map(
    unlinkedAssignmentCountsRaw.map((x) => [
      buildScopeKey(x?._id?.createdBy, x?._id?.gradeId, x?._id?.subjectId),
      Number(x?.count || 0),
    ])
  );
  const allGradeIds = new Set();
  const allSubjectIds = new Set();

  for (const cls of classes) {
    if (cls?.gradeId) allGradeIds.add(String(cls.gradeId));
    if (cls?.subjectId) allSubjectIds.add(String(cls.subjectId));
  }

  for (const student of studentsRaw) {
    if (student?.gradeId) allGradeIds.add(String(student.gradeId));
    for (const subjectId of Array.isArray(student?.assignedSubjectIds) ? student.assignedSubjectIds : []) {
      if (subjectId) allSubjectIds.add(String(subjectId));
    }
  }

  const [gradeDocs, subjectDocs] = await Promise.all([
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
    mergedStudentIdsByClass.set(
      String(cls._id),
      new Set((Array.isArray(cls.students) ? cls.students : []).map((id) => String(id)))
    );
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

  const data = classes.map((cls) => {
    const teacherId = String(cls?.teacher?._id || cls?.teacher || "").trim();
    const gradeId = String(cls?.gradeId || "").trim();
    const subjectId = String(cls?.subjectId || "").trim();
    const scopeKey = buildScopeKey(teacherId, gradeId, subjectId);

    const linkedLessons = Number(lessonCounts.get(String(cls._id)) || 0);
    const linkedAssignments = Number(assignmentCounts.get(String(cls._id)) || 0);
    const unlinkedLessons = teacherId && gradeId && subjectId ? Number(unlinkedLessonCounts.get(scopeKey) || 0) : 0;
    const unlinkedAssignments =
      teacherId && gradeId && subjectId ? Number(unlinkedAssignmentCounts.get(scopeKey) || 0) : 0;

    return {
      id: cls._id,
      className: cls.className || `${cls.subject} - ${cls.gradeLevel}`,
      subject: cls.subject,
      subjectId: cls.subjectId || null,
      gradeLevel: cls.gradeLevel,
      gradeId: cls.gradeId || null,
      teacher: cls.teacher
        ? {
            id: cls.teacher._id,
            name: cls.teacher.name,
            phone: cls.teacher.phone || null,
            email: cls.teacher.email || null,
          }
        : null,
      status: cls.status,
      schedule:
        Array.isArray(cls.schedule) && cls.schedule.length > 0
          ? cls.schedule
          : timetableByClassId.get(String(cls._id)) || [],
      studentsCount: Number(mergedStudentIdsByClass.get(String(cls._id))?.size || 0),
      lessonsCount: linkedLessons + unlinkedLessons,
      assignmentsCount: linkedAssignments + unlinkedAssignments,
      createdAt: cls.createdAt,
      updatedAt: cls.updatedAt,
    };
  });

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const createAdminClass = async ({ payload }) => {
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

  let teacherId = payload?.teacherId || payload?.teacher;
  if (!teacherId) {
    const teacher = await findTeacherForScope({ subjectRef, gradeRef });
    if (!teacher) {
      throw new AppError("No active teacher available for selected subject/grade", 400);
    }
    teacherId = teacher._id;
  }

  const teacher = await validateTeacherAssignment({
    teacherId,
    subjectRef,
    gradeRef,
  });

  const maxStudents =
    payload?.maxStudents !== undefined ? payload.maxStudents : payload?.numberOfStudents;
  const className = resolveClassName({
    className: payload?.className,
    subject: subjectRef.subject,
    gradeLevel: gradeRef.gradeLevel,
  });

  const classData = {
    className,
    teacher: teacherId,
    teacherName: normalize(teacher?.name),
    subject: subjectRef.subject,
    subjectId: subjectRef.subjectId || null,
    gradeLevel: gradeRef.gradeLevel,
    gradeId: gradeRef.gradeId || null,
    students: Array.isArray(payload?.students) ? payload.students : [],
    maxStudents,
    status: normalizeClassStatus(payload?.status),
    schedule: Array.isArray(payload?.schedule) ? payload.schedule : [],
  };

  const existing = await ClassModel.findOne({
    teacher: classData.teacher,
    subject: classData.subject,
    gradeLevel: classData.gradeLevel,
  });

  if (existing) {
    // Idempotent behavior for admin create flow:
    // if class already exists, treat this request as an update.
    existing.subjectId = classData.subjectId || existing.subjectId || null;
    existing.gradeId = classData.gradeId || existing.gradeId || null;
    existing.className = classData.className || existing.className || "";
    existing.teacherName = classData.teacherName || existing.teacherName || "";
    if (payload?.maxStudents !== undefined) existing.maxStudents = classData.maxStudents;
    if (payload?.students !== undefined) existing.students = classData.students;
    if (payload?.status !== undefined) existing.status = normalizeClassStatus(payload?.status);
    if (payload?.schedule !== undefined) existing.schedule = classData.schedule;
    await existing.save();
    return { classDoc: existing, created: false };
  }

  const created = await ClassModel.create(classData);
  return { classDoc: created, created: true };
};

export const updateAdminClass = async ({ classId, payload }) => {
  if (!mongoose.Types.ObjectId.isValid(String(classId))) {
    throw new AppError("Invalid classId", 400);
  }

  const cls = await ClassModel.findById(classId);
  if (!cls) throw new AppError("Class not found", 404);

  const nextSubjectRef = await resolveSubjectRef({
    subjectId: payload?.subjectId !== undefined ? payload?.subjectId : cls.subjectId,
    subject: payload?.subject !== undefined ? payload?.subject : cls.subject,
    required: true,
  });

  const nextGradeRef = await resolveGradeRef({
    gradeId: payload?.gradeId !== undefined ? payload?.gradeId : cls.gradeId,
    gradeLevel: payload?.gradeLevel !== undefined ? payload?.gradeLevel : cls.gradeLevel,
    required: true,
  });

  const nextTeacherId = payload?.teacherId || payload?.teacher || cls.teacher;

  const teacher = await validateTeacherAssignment({
    teacherId: nextTeacherId,
    subjectRef: nextSubjectRef,
    gradeRef: nextGradeRef,
  });

  cls.teacher = nextTeacherId;
  cls.teacherName = normalize(teacher?.name);
  cls.subject = nextSubjectRef.subject;
  cls.subjectId = nextSubjectRef.subjectId || null;
  cls.gradeLevel = nextGradeRef.gradeLevel;
  cls.gradeId = nextGradeRef.gradeId || null;
  if (payload?.className !== undefined) {
    cls.className = resolveClassName({
      className: payload.className,
      subject: cls.subject,
      gradeLevel: cls.gradeLevel,
    });
  } else if (!cls.className) {
    cls.className = resolveClassName({
      className: "",
      subject: cls.subject,
      gradeLevel: cls.gradeLevel,
    });
  }

  if (payload?.students !== undefined) {
    cls.students = Array.isArray(payload.students) ? payload.students : [];
  }
  if (payload?.maxStudents !== undefined) cls.maxStudents = payload.maxStudents;
  if (payload?.numberOfStudents !== undefined) cls.maxStudents = payload.numberOfStudents;
  if (payload?.status !== undefined) cls.status = normalizeClassStatus(payload?.status);
  if (payload?.schedule !== undefined) {
    if (!Array.isArray(payload.schedule)) {
      throw new AppError("schedule must be an array", 400);
    }
    cls.schedule = payload.schedule;
  }

  try {
    await cls.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError("Class already exists for this teacher + grade + subject", 409);
    }
    throw err;
  }

  return cls;
};

export const deleteAdminClass = async ({ classId, hardDelete = false }) => {
  if (!mongoose.Types.ObjectId.isValid(String(classId))) {
    throw new AppError("Invalid classId", 400);
  }

  const cls = await ClassModel.findById(classId);
  if (!cls) throw new AppError("Class not found", 404);

  if (hardDelete) {
    await ClassModel.findByIdAndDelete(classId);
    return { deleted: true, mode: "hard", classId };
  }

  cls.status = "archived";
  await cls.save();

  return { deleted: true, mode: "soft", classId: cls._id, status: cls.status };
};

export const getAdminSubjectsSummary = async (query = {}) => {
  const onlyActive = parseBool(query.onlyActive);
  const subjectFilter = {};
  if (onlyActive !== undefined) subjectFilter.isActive = onlyActive;

  const [subjects, classCountsBySubjectId, classCountsBySubjectName] = await Promise.all([
    Subject.find(subjectFilter).sort({ name: 1 }).lean(),
    ClassModel.aggregate([
      { $match: { subjectId: { $ne: null } } },
      { $group: { _id: "$subjectId", classCount: { $sum: 1 } } },
    ]),
    ClassModel.aggregate([
      { $group: { _id: "$subject", classCount: { $sum: 1 } } },
    ]),
  ]);

  const byId = new Map(classCountsBySubjectId.map((x) => [String(x._id), x.classCount]));
  const byName = new Map(classCountsBySubjectName.map((x) => [String(x._id), x.classCount]));

  const data = subjects.map((s) => ({
    id: s._id,
    name: s.name,
    code: s.code || "",
    color: s.color || "#1f3c88",
    isActive: s.isActive,
    classCount: byId.get(String(s._id)) || byName.get(s.name) || 0,
  }));

  return { data };
};

export const getAdminGradesSections = async (query = {}) => {
  const onlyActive = parseBool(query.onlyActive);
  const gradeFilter = {};
  if (onlyActive !== undefined) gradeFilter.isActive = onlyActive;

  const [grades, classCountsByGradeId, classCountsByGradeLabel] = await Promise.all([
    Grade.find(gradeFilter).sort({ order: 1 }).lean(),
    ClassModel.aggregate([
      { $match: { gradeId: { $ne: null } } },
      { $group: { _id: "$gradeId", classCount: { $sum: 1 } } },
    ]),
    ClassModel.aggregate([{ $group: { _id: "$gradeLevel", classCount: { $sum: 1 } } }]),
  ]);

  const byId = new Map(classCountsByGradeId.map((x) => [String(x._id), x.classCount]));
  const byLabel = new Map(classCountsByGradeLabel.map((x) => [String(x._id), x.classCount]));

  const data = grades.map((g) => ({
    id: g._id,
    label: g.label,
    order: g.order,
    isActive: g.isActive,
    sections: g.sections || [],
    classCount: byId.get(String(g._id)) || byLabel.get(g.label) || 0,
  }));

  return { data };
};

export const getAdminContentStats = async () => {
  const [lessons, videos, documents, assignments] = await Promise.all([
    Lesson.countDocuments(),
    Lesson.countDocuments({ contentType: { $in: ["video"] } }),
    Lesson.countDocuments({ contentType: "pdf" }),
    Assignment.countDocuments(),
  ]);

  return {
    lessons,
    videos,
    documents,
    assignments,
  };
};
