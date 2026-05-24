import mongoose from "mongoose";
import Class from "../modules/class/class.model.js";
import User from "../modules/user/user.model.js";
import Grade from "../modules/grade/grade.model.js";
import Subject from "../modules/subject/subject.model.js";
import AppError from "./AppError.js";

const STUDENT_PROFILE_SELECT = "role gradeLevel gradeId assignedSubjects assignedSubjectIds";

export const resolveRefId = (ref) => {
  if (ref == null) return null;
  if (typeof ref === "object" && ref._id != null) return String(ref._id);
  return String(ref);
};

const toStudentObjectId = (studentId) =>
  studentId instanceof mongoose.Types.ObjectId
    ? studentId
    : new mongoose.Types.ObjectId(String(studentId));

const addProfileScopePairs = async (studentDoc, pairs) => {
  let profileGradeId = studentDoc.gradeId || null;
  if (!profileGradeId && studentDoc.gradeLevel) {
    const gradeDoc = await Grade.findOne({ label: studentDoc.gradeLevel }).select("_id").lean();
    profileGradeId = gradeDoc?._id || null;
  }

  const subjectIdSet = new Set(
    (Array.isArray(studentDoc.assignedSubjectIds) ? studentDoc.assignedSubjectIds : [])
      .map((id) => String(id))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
  );

  const assignedNames = Array.isArray(studentDoc.assignedSubjects) ? studentDoc.assignedSubjects : [];
  if (assignedNames.length) {
    const subjects = await Subject.find({}).select("_id name").lean();
    for (const subject of subjects) {
      const name = String(subject?.name || "").trim().toLowerCase();
      if (assignedNames.some((n) => String(n || "").trim().toLowerCase() === name)) {
        subjectIdSet.add(String(subject._id));
      }
    }
  }

  if (profileGradeId) {
    for (const subjectId of subjectIdSet) {
      addLessonScopePair(pairs, profileGradeId, subjectId);
    }
  }

  return { profileGradeId, subjectIdSet };
};

/**
 * Active teacher IDs — classes must reference one of these to be visible to students.
 */
export const getActiveTeacherIds = async () =>
  User.find({ role: "teacher", status: "active" }).distinct("_id");

/**
 * Classes a student can access:
 * 1) Explicitly enrolled (class.students contains studentId), or
 * 2) Inferred by grade + assigned subject(s) when those are set on the user.
 *
 * When activeTeacherIds is provided, classes with missing/deleted/blocked teachers are excluded.
 */
export const buildStudentClassAccessFilter = (student, studentId, { activeTeacherIds } = {}) => {
  const sid =
    studentId instanceof mongoose.Types.ObjectId
      ? studentId
      : new mongoose.Types.ObjectId(String(studentId));

  const filters = [{ status: "active" }];

  if (activeTeacherIds !== undefined) {
    if (!activeTeacherIds.length) {
      filters.push({ _id: null });
    } else {
      filters.push({ teacher: { $in: activeTeacherIds } });
    }
  }

  const explicitEnrollmentFilter = { students: sid };

  const inferredAndFilters = [];
  if (student?.gradeLevel || student?.gradeId) {
    const gradeFilter = [];
    if (student?.gradeLevel) gradeFilter.push({ gradeLevel: student.gradeLevel });
    if (student?.gradeId) gradeFilter.push({ gradeId: student.gradeId });
    if (gradeFilter.length) {
      inferredAndFilters.push(gradeFilter.length > 1 ? { $or: gradeFilter } : gradeFilter[0]);
    }
  }

  const assignedSubjects = Array.isArray(student?.assignedSubjects) ? student.assignedSubjects : [];
  const assignedSubjectIds = Array.isArray(student?.assignedSubjectIds)
    ? student.assignedSubjectIds
    : [];
  if (assignedSubjects.length || assignedSubjectIds.length) {
    const subjectFilter = [];
    if (assignedSubjects.length) subjectFilter.push({ subject: { $in: assignedSubjects } });
    if (assignedSubjectIds.length) subjectFilter.push({ subjectId: { $in: assignedSubjectIds } });
    inferredAndFilters.push(subjectFilter.length > 1 ? { $or: subjectFilter } : subjectFilter[0]);
  }

  filters.push(
    inferredAndFilters.length > 0
      ? { $or: [explicitEnrollmentFilter, { $and: inferredAndFilters }] }
      : explicitEnrollmentFilter
  );

  return { $and: filters };
};

export const buildStudentClassAccessFilterForStudent = async (student, studentId) => {
  const activeTeacherIds = await getActiveTeacherIds();
  return buildStudentClassAccessFilter(student, studentId, { activeTeacherIds });
};

/** Archive active classes whose teacher is missing, deleted, or inactive. */
export const archiveOrphanActiveClasses = async () => {
  const activeTeacherIds = await getActiveTeacherIds();
  const orphanFilter = activeTeacherIds.length
    ? {
        status: "active",
        $or: [
          { teacher: { $exists: false } },
          { teacher: null },
          { teacher: { $nin: activeTeacherIds } },
        ],
      }
    : {
        status: "active",
        $or: [{ teacher: { $exists: false } }, { teacher: null }],
      };

  const result = await Class.updateMany(orphanFilter, { $set: { status: "archived" } });
  if (result.modifiedCount > 0) {
    console.info(
      `[classes] Archived ${result.modifiedCount} active class(es) with missing/inactive teachers`
    );
  }
  return result;
};

const pairKey = (gradeId, subjectId) => `${String(gradeId)}::${String(subjectId)}`;

const addLessonScopePair = (pairs, gradeId, subjectId) => {
  if (!gradeId || !subjectId) return;
  if (!mongoose.Types.ObjectId.isValid(String(gradeId))) return;
  if (!mongoose.Types.ObjectId.isValid(String(subjectId))) return;
  pairs.set(pairKey(gradeId, subjectId), {
    gradeId: new mongoose.Types.ObjectId(String(gradeId)),
    subjectId: new mongoose.Types.ObjectId(String(subjectId)),
  });
};

/**
 * Classes, grade+subject pairs, and class IDs a student can access
 * (from enrolled classes and profile grade/subject assignments).
 */
export const buildStudentClassScopeContext = async (student, studentId) => {
  const sid = toStudentObjectId(studentId);

  const studentDoc =
    student ||
    (await User.findById(sid).select(STUDENT_PROFILE_SELECT).lean());

  if (!studentDoc || studentDoc.role !== "student") {
    return {
      studentDoc: null,
      classes: [],
      accessibleClassIds: [],
      scopePairs: [],
    };
  }

  const pairs = new Map();
  const classAccessFilter = await buildStudentClassAccessFilterForStudent(studentDoc, sid);
  const classes = await Class.find(classAccessFilter)
    .select("_id gradeId subjectId gradeLevel subject")
    .lean();

  for (const cls of classes) {
    addLessonScopePair(pairs, cls.gradeId, cls.subjectId);
  }

  await addProfileScopePairs(studentDoc, pairs);

  return {
    studentDoc,
    classes,
    accessibleClassIds: classes.map((cls) => cls._id),
    scopePairs: Array.from(pairs.values()),
  };
};

/**
 * Grade + subject pairs a student should receive lessons for
 * (from enrolled classes and profile assignments).
 */
export const buildStudentLessonScopePairs = async (student, studentId) => {
  const { scopePairs } = await buildStudentClassScopeContext(student, studentId);
  return scopePairs;
};

const buildAssignmentVisibilityOr = (accessibleClassIds, scopePairs) => {
  const orConditions = [];

  if (accessibleClassIds.length > 0) {
    orConditions.push({ classId: { $in: accessibleClassIds } });
  }

  if (scopePairs.length > 0) {
    orConditions.push({
      $and: [
        { $or: [{ classId: null }, { classId: { $exists: false } }] },
        { $or: scopePairs.map(({ gradeId, subjectId }) => ({ gradeId, subjectId })) },
      ],
    });
  }

  return orConditions;
};

/** Mongo filter for assignments visible to this student (class + grade + subject scope). */
export const buildStudentAssignmentFilter = async (student, studentId, extra = {}) => {
  const { accessibleClassIds, scopePairs } = await buildStudentClassScopeContext(student, studentId);
  const orConditions = buildAssignmentVisibilityOr(accessibleClassIds, scopePairs);

  if (!orConditions.length) return { _id: null, ...extra };

  return {
    status: { $ne: "draft" },
    $or: orConditions,
    ...extra,
  };
};

/** Mongo filter for assignments in one grade+subject scope the student is assigned to. */
export const buildStudentAssignmentFilterForScope = async (
  student,
  studentId,
  { gradeId, subjectId },
  extra = {}
) => {
  const gId = String(gradeId || "").trim();
  const sId = String(subjectId || "").trim();
  const { studentDoc, classes, scopePairs } = await buildStudentClassScopeContext(student, studentId);

  if (!studentDoc) throw new AppError("Student not found", 404);

  const pairAllowed = scopePairs.some(
    (pair) => String(pair.gradeId) === gId && String(pair.subjectId) === sId
  );
  if (!pairAllowed) {
    throw new AppError("You are not assigned to this grade and subject", 403);
  }

  const classIdsForScope = classes
    .filter((cls) => String(cls.gradeId) === gId && String(cls.subjectId) === sId)
    .map((cls) => cls._id);

  const orConditions = [];
  if (classIdsForScope.length) {
    orConditions.push({ classId: { $in: classIdsForScope } });
  }
  orConditions.push({
    $and: [
      { $or: [{ classId: null }, { classId: { $exists: false } }] },
      { gradeId: gId, subjectId: sId },
    ],
  });

  return {
    gradeId: gId,
    subjectId: sId,
    status: { $ne: "draft" },
    $or: orConditions,
    ...extra,
  };
};

export const studentCanAccessAssignment = (assignment, context) => {
  if (!assignment || !context) return false;

  const { accessibleClassIds, scopePairs } = context;
  const classId = resolveRefId(assignment.classId);

  if (classId) {
    return accessibleClassIds.some((id) => String(id) === classId);
  }

  const gradeId = resolveRefId(assignment.gradeId);
  const subjectId = resolveRefId(assignment.subjectId);
  return scopePairs.some(
    (pair) => String(pair.gradeId) === gradeId && String(pair.subjectId) === subjectId
  );
};

/** Mongo filter for published lessons visible to this student. */
export const buildStudentPublishedLessonFilter = async (student, studentId, extra = {}) => {
  const pairs = await buildStudentLessonScopePairs(student, studentId);
  if (!pairs.length) return { _id: null, ...extra };

  return {
    status: "published",
    $or: pairs.map(({ gradeId, subjectId }) => ({ gradeId, subjectId })),
    ...extra,
  };
};

export const studentCanAccessLessonScope = (lesson, pairs) => {
  if (!lesson || !pairs?.length) return false;
  const lessonGradeId = String(lesson.gradeId?._id || lesson.gradeId || "");
  const lessonSubjectId = String(lesson.subjectId?._id || lesson.subjectId || "");
  return pairs.some(
    (p) => String(p.gradeId) === lessonGradeId && String(p.subjectId) === lessonSubjectId
  );
};

export const mapStudentClassSummary = (cls) => {
  const teacherId = resolveRefId(cls.teacher);
  const teacherDoc = cls.teacher && typeof cls.teacher === "object" ? cls.teacher : null;
  const teacherName = teacherDoc?.name ? String(teacherDoc.name).trim() : null;

  return {
    classId: cls._id,
    id: cls._id,
    className: cls.className || null,
    subject: cls.subject,
    subjectId: cls.subjectId || null,
    gradeLevel: cls.gradeLevel,
    gradeId: cls.gradeId || null,
    teacher: teacherId && teacherName ? { id: teacherId, name: teacherName } : null,
    studentsCount: Array.isArray(cls.students) ? cls.students.length : 0,
    maxStudents: cls.maxStudents ?? null,
    status: cls.status,
    schedule: cls.schedule || [],
  };
};
