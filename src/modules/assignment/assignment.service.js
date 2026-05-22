import AppError from "../../utils/AppError.js";
import mongoose from "mongoose";
import { Assignment } from "./assignment.model.js";
import { Submission } from "../submisssion/submission.model.js";
import User from "../user/user.model.js";
import Grade from "../grade/grade.model.js";
import Subject from "../subject/subject.model.js";
import ClassModel from "../class/class.model.js";
import { buildStoredFileMetaList } from "../../utils/fileStorage.js";

const norm = (v) => String(v || "").trim().toLowerCase();
const POPULATE_SCOPE = [
  { path: "gradeId", select: "_id label" },
  { path: "subjectId", select: "_id name" },
  { path: "createdBy", select: "_id name role" },
];

const resolveRefId = (ref) => {
  if (ref == null) return null;
  if (typeof ref === "object" && ref._id != null) return String(ref._id);
  return String(ref);
};

const teacherOwnsAssignment = (assignment, teacherId) => {
  const tid = String(teacherId);
  return (
    resolveRefId(assignment.createdBy) === tid ||
    resolveRefId(assignment.classInfo?.teacher) === tid
  );
};

const pickLatestSubmissionPerAssignment = (submissions = []) => {
  const latestMap = new Map();
  for (const s of submissions) {
    const key = String(s.assignmentId);
    const existing = latestMap.get(key);
    if (!existing || new Date(s.submittedAt) > new Date(existing.submittedAt)) {
      latestMap.set(key, s);
    }
  }
  return latestMap;
};

const getStudentAssignmentStatus = (submission) => {
  if (!submission) {
    return { myStatus: "pending", myGrade: null };
  }

  const normalizedStatus = String(submission.status || "").trim().toLowerCase();
  if (normalizedStatus === "graded" || submission.grade?.gradedAt) {
    return { myStatus: "graded", myGrade: submission.grade || null };
  }

  if (normalizedStatus === "submitted") {
    return { myStatus: "submitted", myGrade: null };
  }

  return { myStatus: "pending", myGrade: null };
};

const resolveStudentAssignmentScope = async (studentId) => {
  const student = await User.findById(studentId)
    .select("role gradeId gradeLevel assignedSubjectIds assignedSubjects")
    .lean();
  if (!student || student.role !== "student") throw new AppError("Student not found", 404);

  let gradeDoc = null;
  if (student?.gradeId) {
    gradeDoc = await Grade.findById(student.gradeId).select("_id label").lean();
  }
  if (!gradeDoc && student?.gradeLevel) {
    gradeDoc = await Grade.findOne({ label: student.gradeLevel }).select("_id label").lean();
  }

  const subjectIdSet = new Set(
    (Array.isArray(student?.assignedSubjectIds) ? student.assignedSubjectIds : [])
      .map((id) => String(id || "").trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
  );

  const assignedSubjectNames = Array.isArray(student?.assignedSubjects)
    ? student.assignedSubjects
    : [];
  const normalizedAssignedNames = assignedSubjectNames.map(norm).filter(Boolean);

  if (normalizedAssignedNames.length) {
    const subjects = await Subject.find({}).select("_id name").lean();
    for (const subject of subjects) {
      if (normalizedAssignedNames.includes(norm(subject.name))) {
        subjectIdSet.add(String(subject._id));
      }
    }
  }

  return {
    student,
    gradeDoc,
    allowedSubjectIds: Array.from(subjectIdSet),
  };
};

const normalizeStudentAssignmentFilterStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["pending", "submitted", "graded"].includes(normalized)) return normalized;
  throw new AppError("Invalid status filter. Use pending/submitted/graded", 400);
};

const shouldKeepPendingAssignment = (assignment, now = new Date()) => {
  const dueAt = assignment?.dueAt ? new Date(assignment.dueAt) : null;
  if (!dueAt || Number.isNaN(dueAt.getTime())) return true;
  if (dueAt >= now) return true;
  return Boolean(assignment?.lateAllowed);
};

const getField = (payload, fieldName) => {
  if (!payload || typeof payload !== "object") return undefined;
  if (payload[fieldName] !== undefined) return payload[fieldName];
  const target = String(fieldName).trim().toLowerCase();
  for (const [k, v] of Object.entries(payload)) {
    if (String(k).trim().toLowerCase() === target) return v;
  }
  return undefined;
};

const parseStringArrayField = (value) => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const raw = String(value || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {
    // fallback to comma-separated format
  }

  return raw
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
};

const parseObjectId = (value, field) => {
  const id = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${field} format`, 400);
  return id;
};

const combineDueAt = (dueDate, dueTime) => {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  if (!dueTime) return date;

  const t = String(dueTime).trim();
  const [hh, mm] = t.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return date;

  date.setHours(hh, mm, 0, 0);
  return date;
};

const getScopeDocs = async ({ gradeId, subjectId }) => {
  const [grade, subject, maybeSubjectFromGradeId, maybeGradeFromSubjectId] = await Promise.all([
    Grade.findById(gradeId).lean(),
    Subject.findById(subjectId).lean(),
    Subject.findById(gradeId).select("_id name").lean(),
    Grade.findById(subjectId).select("_id label").lean(),
  ]);

  if (!grade) {
    if (maybeSubjectFromGradeId) {
      throw new AppError(
        `gradeId points to Subject("${maybeSubjectFromGradeId.name}"). You likely swapped gradeId and subjectId.`,
        400
      );
    }
    throw new AppError("Grade not found", 404);
  }

  if (!subject) {
    if (maybeGradeFromSubjectId) {
      throw new AppError(
        `subjectId points to Grade("${maybeGradeFromSubjectId.label}"). You likely swapped gradeId and subjectId.`,
        400
      );
    }
    throw new AppError("Subject not found", 404);
  }
  if (grade.isActive === false) throw new AppError("Grade is inactive", 400);
  if (subject.isActive === false) throw new AppError("Subject is inactive", 400);

  return { grade, subject };
};

const ensureTeacherScopeAccess = ({ teacher, gradeLabel, subjectName }) => {
  if (norm(teacher.subject) !== norm(subjectName)) {
    throw new AppError(`You are assigned to "${teacher.subject}", not "${subjectName}"`, 403);
  }
  const grades = Array.isArray(teacher.assignedGrades) ? teacher.assignedGrades.map(norm) : [];
  if (!grades.includes(norm(gradeLabel))) {
    throw new AppError(`You are not assigned to grade "${gradeLabel}"`, 403);
  }
};

const resolveClassForScope = async ({ teacherId, gradeId, subjectId }) => {
  return ClassModel.findOne({
    teacher: teacherId,
    gradeId,
    subjectId,
    status: "active",
  })
    .select("_id teacher gradeLevel gradeId subject subjectId")
    .lean();
};

const assertStudentScopeAccess = async ({ gradeId, subjectId, studentId }) => {
  const { student, gradeDoc, allowedSubjectIds } = await resolveStudentAssignmentScope(studentId);
  const { grade, subject } = await getScopeDocs({ gradeId, subjectId });
  const gradeMatches =
    (gradeDoc?._id && String(gradeDoc._id) === String(grade._id)) ||
    norm(student.gradeLevel) === norm(grade.label);
  if (!gradeMatches) {
    throw new AppError("This assignment is not for your grade", 403);
  }

  const subjectMatches =
    allowedSubjectIds.includes(String(subject._id)) ||
    (Array.isArray(student.assignedSubjects) ? student.assignedSubjects : [])
      .map(norm)
      .includes(norm(subject.name));
  if (!subjectMatches) {
    throw new AppError("You are not assigned to this subject", 403);
  }

  return { student, grade, subject };
};

// Teacher create assignment by gradeId + subjectId
export const createAssignmentFromForm = async ({ teacherId, payload, files }) => {
  const title = String(getField(payload, "title") || "").trim();
  const description = String(getField(payload, "description") || "").trim();
  const dueDate = getField(payload, "dueDate");
  const dueTime = getField(payload, "dueTime");
  const pointsRaw = getField(payload, "points");
  const gradeId = parseObjectId(getField(payload, "gradeId"), "gradeId");
  const subjectId = parseObjectId(getField(payload, "subjectId"), "subjectId");

  const dueAt = combineDueAt(dueDate, dueTime);
  const points = Number(pointsRaw);
  const receivedKeys = Object.keys(payload || {});

  if (!title) {
    throw new AppError(
      `Assignment title is required (received keys: ${receivedKeys.join(", ") || "none"})`,
      400
    );
  }
  if (!dueAt) throw new AppError("Due date is required (valid date)", 400);
  if (!Number.isFinite(points) || points <= 0) throw new AppError("Points must be a positive number", 400);

  const [teacher, scope] = await Promise.all([
    User.findById(teacherId).select("role subject assignedGrades").lean(),
    getScopeDocs({ gradeId, subjectId }),
  ]);
  if (!teacher || teacher.role !== "teacher") throw new AppError("Teacher not found", 404);
  ensureTeacherScopeAccess({
    teacher,
    gradeLabel: scope.grade.label,
    subjectName: scope.subject.name,
  });

  const attachments = buildStoredFileMetaList(files, "assignments");

  const explicitClassId = getField(payload, "classId");
  let classDoc = null;
  if (explicitClassId && mongoose.Types.ObjectId.isValid(String(explicitClassId))) {
    classDoc = await ClassModel.findById(explicitClassId)
      .select("_id teacher gradeLevel gradeId subject subjectId status")
      .lean();
    if (classDoc && String(classDoc.teacher) !== String(teacherId)) {
      throw new AppError("Selected class does not belong to this teacher", 403);
    }
  }
  if (!classDoc) {
    classDoc = await resolveClassForScope({ teacherId, gradeId, subjectId });
  }

  const created = await Assignment.create({
    classId: classDoc?._id || null,
    gradeId,
    subjectId,
    createdBy: teacherId,
    classInfo: classDoc
      ? {
          gradeLevel: classDoc.gradeLevel,
          gradeId: classDoc.gradeId || null,
          subject: classDoc.subject,
          subjectId: classDoc.subjectId || null,
          teacher: classDoc.teacher || null,
        }
      : undefined,
    title,
    description,
    dueAt,
    points,
    attachments,
    status: "active",
  });

  return Assignment.findById(created._id).populate(POPULATE_SCOPE).lean();
};

// Student: list assignments by explicit gradeId + subjectId scope
export const getClassAssignmentsForStudent = async ({ gradeId, subjectId, studentId }) => {
  const gId = parseObjectId(gradeId, "gradeId");
  const sId = parseObjectId(subjectId, "subjectId");
  await assertStudentScopeAccess({ gradeId: gId, subjectId: sId, studentId });

  const assignments = await Assignment.find({
    gradeId: gId,
    subjectId: sId,
    status: { $ne: "draft" },
  })
    .populate(POPULATE_SCOPE)
    .sort({ dueAt: 1 })
    .lean();

  const ids = assignments.map((a) => a._id);
  const submissions = await Submission.find({ assignmentId: { $in: ids }, studentId })
    .select("assignmentId grade submittedAt status")
    .lean();
  const subMap = pickLatestSubmissionPerAssignment(submissions);

  return assignments.map((a) => {
    const sub = subMap.get(String(a._id));
    const { myStatus, myGrade } = getStudentAssignmentStatus(sub);
    return { ...a, myStatus, myGrade };
  });
};

export const getMyAssignmentsForStudent = async ({ studentId, status }) => {
  const { student, gradeDoc, allowedSubjectIds } = await resolveStudentAssignmentScope(studentId);
  const statusFilter = normalizeStudentAssignmentFilterStatus(status);

  if (!gradeDoc) {
    return {
      data: [],
      meta: {
        studentGrade: student.gradeLevel,
        studentSubjects: student.assignedSubjects || [],
        matchedAssignmentCount: 0,
        statusFilter,
      },
    };
  }

  if (!allowedSubjectIds.length) {
    return {
      data: [],
      meta: {
        studentGrade: student.gradeLevel,
        studentSubjects: student.assignedSubjects || [],
        matchedAssignmentCount: 0,
        statusFilter,
      },
    };
  }

  const assignments = await Assignment.find({
    gradeId: gradeDoc._id,
    subjectId: { $in: allowedSubjectIds },
    status: { $ne: "draft" },
  })
    .populate(POPULATE_SCOPE)
    .sort({ dueAt: 1 })
    .lean();

  const ids = assignments.map((a) => a._id);
  const submissions = await Submission.find({ assignmentId: { $in: ids }, studentId })
    .select("assignmentId grade submittedAt status")
    .lean();
  const subMap = pickLatestSubmissionPerAssignment(submissions);

  const mappedAssignments = assignments.map((a) => {
    const sub = subMap.get(String(a._id));
    const { myStatus, myGrade } = getStudentAssignmentStatus(sub);
    return { ...a, myStatus, myGrade };
  });
  const now = new Date();
  const data = statusFilter
    ? mappedAssignments.filter((assignment) => {
        if (assignment.myStatus !== statusFilter) return false;
        if (statusFilter !== "pending") return true;
        return shouldKeepPendingAssignment(assignment, now);
      })
    : mappedAssignments;

  return {
    data,
    meta: {
      studentGrade: student.gradeLevel,
      studentSubjects: student.assignedSubjects || [],
      matchedAssignmentCount: data.length,
      statusFilter,
    },
  };
};

export const getPendingAssignmentsForStudent = async ({ studentId }) => {
  return getMyAssignmentsForStudent({ studentId, status: "pending" });
};

export const getPendingAssignmentsForStudentGrade = async ({ studentId }) => {
  const student = await User.findById(studentId).select("role gradeId gradeLevel").lean();
  if (!student || student.role !== "student") throw new AppError("Student not found", 404);

  let gradeId = student?.gradeId ? String(student.gradeId) : "";
  if (!gradeId && student?.gradeLevel) {
    const gradeDoc = await Grade.findOne({ label: student.gradeLevel }).select("_id label").lean();
    if (gradeDoc?._id) gradeId = String(gradeDoc._id);
  }

  if (!gradeId) {
    return {
      data: [],
      meta: {
        studentGrade: student.gradeLevel || null,
        pendingAssignmentCount: 0,
      },
    };
  }

  const assignments = await Assignment.find({
    gradeId,
    status: { $ne: "draft" },
  })
    .populate(POPULATE_SCOPE)
    .sort({ dueAt: 1 })
    .lean();

  const ids = assignments.map((a) => a._id);
  const submissions = await Submission.find({ assignmentId: { $in: ids }, studentId })
    .select("assignmentId grade submittedAt status")
    .lean();
  const subMap = pickLatestSubmissionPerAssignment(submissions);

  const pendingAssignments = assignments
    .map((a) => {
      const sub = subMap.get(String(a._id));
      const { myStatus, myGrade } = getStudentAssignmentStatus(sub);
      return { ...a, myStatus, myGrade };
    })
    .filter(
      (assignment) =>
        assignment.myStatus === "pending" && shouldKeepPendingAssignment(assignment, new Date())
    );

  return {
    data: pendingAssignments,
    meta: {
      studentGrade: student.gradeLevel || null,
      pendingAssignmentCount: pendingAssignments.length,
    },
  };
};

// Student: assignment detail + my submission
export const getAssignmentDetailsForStudent = async ({ assignmentId, studentId }) => {
  const assignment = await Assignment.findById(assignmentId).populate(POPULATE_SCOPE).lean();
  if (!assignment) throw new AppError("Assignment not found", 404);

  await assertStudentScopeAccess({
    gradeId: assignment.gradeId?._id || assignment.gradeId,
    subjectId: assignment.subjectId?._id || assignment.subjectId,
    studentId,
  });

  const submission = await Submission.findOne({ assignmentId, studentId })
    .sort({ submittedAt: -1 })
    .lean();

  return { assignment, submission };
};

// Teacher: view submissions list
export const getTeacherSubmissions = async ({ assignmentId, teacherId }) => {
  const assignment = await Assignment.findById(assignmentId).populate(POPULATE_SCOPE).lean();
  if (!assignment) throw new AppError("Assignment not found", 404);
  if (!teacherOwnsAssignment(assignment, teacherId)) {
    throw new AppError("You are not allowed to view submissions for this assignment", 403);
  }

  const submissions = await Submission.find({ assignmentId })
    .populate("studentId", "name role")
    .sort({ submittedAt: -1 })
    .lean();

  const latestByStudent = new Map();
  for (const sub of submissions) {
    const sid = sub.studentId?._id ? String(sub.studentId._id) : String(sub.studentId);
    if (!latestByStudent.has(sid)) latestByStudent.set(sid, sub);
  }

  return { assignment, submissions: Array.from(latestByStudent.values()) };
};

// Admin: overview
export const adminAssignmentsOverview = async () => {
  return Assignment.find({ status: { $in: ["active", "closed"] } })
    .populate(POPULATE_SCOPE)
    .sort({ createdAt: -1 })
    .lean();
};

// Admin: submissions for one assignment
export const adminAssignmentSubmissions = async ({ assignmentId }) => {
  const assignment = await Assignment.findById(assignmentId).populate(POPULATE_SCOPE).lean();
  if (!assignment) throw new AppError("Assignment not found", 404);

  const submissions = await Submission.find({ assignmentId })
    .populate("studentId", "name role")
    .sort({ submittedAt: -1 })
    .lean();

  const latestByStudent = new Map();
  for (const sub of submissions) {
    const sid = sub.studentId?._id ? String(sub.studentId._id) : String(sub.studentId);
    if (!latestByStudent.has(sid)) latestByStudent.set(sid, sub);
  }

  return { assignment, submissions: Array.from(latestByStudent.values()) };
};

export const updateAssignmentById = async ({ assignmentId, user, payload, files }) => {
  if (!mongoose.Types.ObjectId.isValid(String(assignmentId || ""))) {
    throw new AppError("Invalid assignmentId format", 400);
  }

  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw new AppError("Assignment not found", 404);
  if (user.role === "teacher" && String(assignment.createdBy) !== String(user._id)) {
    throw new AppError("You can only edit your own assignments", 403);
  }

  const title = getField(payload, "title");
  const description = getField(payload, "description");
  const pointsRaw = getField(payload, "points");
  const statusRaw = getField(payload, "status");
  const lateAllowedRaw = getField(payload, "lateAllowed");
  const removeAttachmentUrlsRaw = getField(payload, "removeAttachmentUrls");
  const removeAttachmentKeysRaw = getField(payload, "removeAttachmentKeys");

  if (title !== undefined) assignment.title = String(title).trim();
  if (description !== undefined) assignment.description = String(description).trim();

  if (pointsRaw !== undefined) {
    const points = Number(pointsRaw);
    if (!Number.isFinite(points) || points <= 0) throw new AppError("Points must be a positive number", 400);
    assignment.points = points;
  }

  if (statusRaw !== undefined) {
    const status = String(statusRaw).trim().toLowerCase();
    if (!["active", "closed", "draft"].includes(status)) {
      throw new AppError("Invalid status. Use active/closed/draft", 400);
    }
    assignment.status = status;
  }

  if (lateAllowedRaw !== undefined) {
    if (typeof lateAllowedRaw === "boolean") {
      assignment.lateAllowed = lateAllowedRaw;
    } else {
      const normalized = String(lateAllowedRaw).trim().toLowerCase();
      assignment.lateAllowed = ["true", "1", "yes"].includes(normalized);
    }
  }

  const dueDate = getField(payload, "dueDate");
  const dueTime = getField(payload, "dueTime");
  if (dueDate !== undefined || dueTime !== undefined) {
    const baseDate = dueDate !== undefined ? dueDate : assignment.dueAt;
    const nextDueAt = combineDueAt(baseDate, dueTime);
    if (!nextDueAt) throw new AppError("Due date is required (valid date)", 400);
    assignment.dueAt = nextDueAt;
  }

  const newAttachments = buildStoredFileMetaList(files, "assignments");
  if (newAttachments.length) {
    assignment.attachments = [...(assignment.attachments || []), ...newAttachments];
  }

  const removeAttachmentUrls = parseStringArrayField(removeAttachmentUrlsRaw);
  const removeAttachmentKeys = parseStringArrayField(removeAttachmentKeysRaw);
  if (removeAttachmentUrls.length || removeAttachmentKeys.length) {
    const removeUrlSet = new Set(removeAttachmentUrls);
    const removeKeySet = new Set(removeAttachmentKeys);
    assignment.attachments = (assignment.attachments || []).filter((item) => {
      const url = String(item?.url || "").trim();
      const key = String(item?.storageKey || "").trim();
      if (url && removeUrlSet.has(url)) return false;
      if (key && removeKeySet.has(key)) return false;
      return true;
    });
  }

  await assignment.save();
  return Assignment.findById(assignment._id).populate(POPULATE_SCOPE).lean();
};

export const deleteAssignmentById = async ({ assignmentId, user }) => {
  if (!mongoose.Types.ObjectId.isValid(String(assignmentId || ""))) {
    throw new AppError("Invalid assignmentId format", 400);
  }
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw new AppError("Assignment not found", 404);

  if (user.role === "teacher" && String(assignment.createdBy) !== String(user._id)) {
    throw new AppError("You can only delete your own assignments", 403);
  }

  await Promise.all([Assignment.findByIdAndDelete(assignmentId), Submission.deleteMany({ assignmentId })]);
  return { deleted: true, assignmentId };
};
