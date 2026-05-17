import mongoose from "mongoose";
import Class from "../modules/class/class.model.js";
import User from "../modules/user/user.model.js";
import Grade from "../modules/grade/grade.model.js";
import Subject from "../modules/subject/subject.model.js";

/**
 * Classes a student can access:
 * 1) Explicitly enrolled (class.students contains studentId), or
 * 2) Inferred by grade + assigned subject(s) when those are set on the user.
 */
export const buildStudentClassAccessFilter = (student, studentId) => {
  const sid =
    studentId instanceof mongoose.Types.ObjectId
      ? studentId
      : new mongoose.Types.ObjectId(String(studentId));

  const filters = [{ status: "active" }];
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
 * Grade + subject pairs a student should receive lessons for
 * (from enrolled classes and profile assignments).
 */
export const buildStudentLessonScopePairs = async (student, studentId) => {
  const sid =
    studentId instanceof mongoose.Types.ObjectId
      ? studentId
      : new mongoose.Types.ObjectId(String(studentId));

  const studentDoc =
    student ||
    (await User.findById(sid)
      .select("gradeLevel gradeId assignedSubjects assignedSubjectIds")
      .lean());

  if (!studentDoc) return [];

  const pairs = new Map();

  const classes = await Class.find(buildStudentClassAccessFilter(studentDoc, sid))
    .select("gradeId subjectId")
    .lean();

  for (const cls of classes) {
    addLessonScopePair(pairs, cls.gradeId, cls.subjectId);
  }

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

  return Array.from(pairs.values());
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

export const mapStudentClassSummary = (cls) => ({
  classId: cls._id,
  id: cls._id,
  className: cls.className || null,
  subject: cls.subject,
  subjectId: cls.subjectId || null,
  gradeLevel: cls.gradeLevel,
  gradeId: cls.gradeId || null,
  teacher: cls.teacher
    ? {
        id: cls.teacher._id || cls.teacher,
        name: cls.teacher.name || cls.teacherName || null,
      }
    : cls.teacherName
      ? { id: null, name: cls.teacherName }
      : null,
  studentsCount: Array.isArray(cls.students) ? cls.students.length : 0,
  maxStudents: cls.maxStudents ?? null,
  status: cls.status,
  schedule: cls.schedule || [],
});
