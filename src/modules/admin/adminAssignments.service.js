import mongoose from "mongoose";
import AppError from "../../utils/AppError.js";
import ClassModel from "../class/class.model.js";
import User from "../user/user.model.js";
import { Assignment } from "../assignment/assignment.model.js";
import { Submission } from "../submisssion/submission.model.js";
import {
  adminAssignmentSubmissions,
  updateAssignmentById,
} from "../assignment/assignment.service.js";
import { buildStoredFileMetaList } from "../../utils/fileStorage.js";

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalize = (v) => String(v || "").trim().toLowerCase();

/**
 * Count students eligible for an assignment scope (grade + subject).
 * Assignment submission access checks:
 * - student.gradeLevel matches grade.label
 * - student.assignedSubjects contains subject.name (case-insensitive)
 */
const countStudentsForGradeAndSubject = async ({ gradeLevel, subject, gradeId, subjectId }) => {
  const g = normalize(gradeLevel);
  const s = normalize(subject);

  if (!gradeId && !g) return 0;
  if (!subjectId && !s) return 0;

  const gradeConditions = [];
  if (gradeId) gradeConditions.push({ gradeId });
  if (g) gradeConditions.push({ gradeLevel: new RegExp(`^${escapeRegex(g)}$`, "i") });

  const subjectConditions = [];
  if (subjectId) subjectConditions.push({ assignedSubjectIds: subjectId });
  if (s) subjectConditions.push({ assignedSubjects: new RegExp(`^${escapeRegex(s)}$`, "i") });

  const gradeCondition = gradeConditions.length === 1 ? gradeConditions[0] : { $or: gradeConditions };
  const subjectCondition = subjectConditions.length === 1 ? subjectConditions[0] : { $or: subjectConditions };

  return User.countDocuments({
    role: "student",
    $and: [gradeCondition, subjectCondition],
  });
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

const normalizeStatusFilter = (status) => {
  const v = String(status || "").trim().toLowerCase();
  if (!v || v === "all") return "all";
  if (["active", "upcoming", "closed", "draft"].includes(v)) return v;
  throw new AppError("Invalid status filter", 400);
};

const mapStatusCounts = (docs = []) => {
  const now = new Date();
  const out = { active: 0, upcoming: 0, closed: 0, draft: 0, total: 0 };

  for (const a of docs) {
    out.total += 1;
    if (a.status === "closed") out.closed += 1;
    else if (a.status === "draft") out.draft += 1;
    else if (a.status === "active" && new Date(a.dueAt) > now) out.upcoming += 1;
    else if (a.status === "active") out.active += 1;
  }
  return out;
};

export const listAdminAssignments = async (query = {}) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 20), 100);
  const skip = (page - 1) * limit;
  const now = new Date();
  const status = normalizeStatusFilter(query.status);

  const filter = {};
  if (query.classId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.classId))) {
      throw new AppError("Invalid classId filter", 400);
    }
    filter.classId = new mongoose.Types.ObjectId(String(query.classId));
  }

  if (status === "closed") filter.status = "closed";
  if (status === "draft") filter.status = "draft";
  if (status === "active") {
    filter.status = "active";
    filter.dueAt = { $lte: now };
  }
  if (status === "upcoming") {
    filter.status = "active";
    filter.dueAt = { $gt: now };
  }

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const [total, assignments] = await Promise.all([
    Assignment.countDocuments(filter),
    Assignment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const assignmentIds = assignments.map((a) => a._id);
  const classIds = assignments.map((a) => a.classId);

  const [classes, submissions] = await Promise.all([
    ClassModel.find({ _id: { $in: classIds } })
      .select("_id gradeLevel gradeId subject subjectId students")
      .lean(),
    Submission.find({ assignmentId: { $in: assignmentIds } })
      .select("assignmentId studentId")
      .lean(),
  ]);

  const classMap = new Map(classes.map((c) => [String(c._id), c]));
  const submittedMap = new Map();
  for (const s of submissions) {
    const key = String(s.assignmentId);
    if (!submittedMap.has(key)) submittedMap.set(key, new Set());
    submittedMap.get(key).add(String(s.studentId));
  }

  // Compute totalStudents per assignment scope (gradeId + subjectId),
  // so every assignment card shows the total students for that grade+subject.
  const pairKeyToCount = new Map();
  const scopeToQuery = new Map(); // key => { gradeId, subjectId }

  for (const a of assignments) {
    const gradeId = a?.gradeId ?? null;
    const subjectId = a?.subjectId ?? null;
    const key = `${String(gradeId || "")}__${String(subjectId || "")}`;
    if (!key || key === "__") continue;
    if (!scopeToQuery.has(key)) scopeToQuery.set(key, { gradeId, subjectId });
  }

  const scopePairs = Array.from(scopeToQuery.entries());
  const scopeCounts = await Promise.all(
    scopePairs.map(async ([key, q]) => [key, await countStudentsForGradeAndSubject(q)])
  );
  for (const [key, count] of scopeCounts) pairKeyToCount.set(key, count);

  const data = assignments.map((a) => {
    const cls = classMap.get(String(a.classId));
    const scopeKey = `${String(a?.gradeId || "")}__${String(a?.subjectId || "")}`;
    const totalStudents = pairKeyToCount.get(scopeKey) ?? 0;
    const submittedCount = submittedMap.has(String(a._id))
      ? submittedMap.get(String(a._id)).size
      : 0;
    const progress = totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0;

    const derivedStatus =
      a.status === "closed"
        ? "closed"
        : a.status === "draft"
        ? "draft"
        : new Date(a.dueAt) > now
        ? "upcoming"
        : "active";

    return {
      id: a._id,
      classId: a.classId,
      title: a.title,
      description: a.description || "",
      dueAt: a.dueAt,
      points: a.points,
      status: a.status,
      derivedStatus,
      lateAllowed: Boolean(a.lateAllowed),
      attachments: Array.isArray(a.attachments) ? a.attachments : [],
      classInfo: {
        gradeLevel: cls?.gradeLevel || a.classInfo?.gradeLevel || null,
        gradeId: cls?.gradeId || a.classInfo?.gradeId || null,
        subject: cls?.subject || a.classInfo?.subject || null,
        subjectId: cls?.subjectId || a.classInfo?.subjectId || null,
      },
      submission: {
        submittedCount,
        totalStudents,
        progress,
      },
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
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

export const getAdminAssignmentsStats = async () => {
  const docs = await Assignment.find({})
    .select("_id status dueAt")
    .lean();
  return mapStatusCounts(docs);
};

export const createAdminAssignment = async ({ payload, files }) => {
  const classId = String(payload?.classId || "").trim();
  if (!classId) throw new AppError("classId is required", 400);
  if (!mongoose.Types.ObjectId.isValid(classId)) throw new AppError("Invalid classId", 400);

  const cls = await ClassModel.findById(classId).lean();
  if (!cls) throw new AppError("Class not found", 404);
  if (!cls.gradeId || !cls.subjectId) {
    throw new AppError("Class is missing grade/subject references. Please update class first", 400);
  }

  if (payload?.subjectId && cls.subjectId && String(payload.subjectId) !== String(cls.subjectId)) {
    throw new AppError("subjectId does not match class", 400);
  }
  if (payload?.gradeId && cls.gradeId && String(payload.gradeId) !== String(cls.gradeId)) {
    throw new AppError("gradeId does not match class", 400);
  }

  const title = String(payload?.title || payload?.assignmentTitle || "").trim();
  if (!title) throw new AppError("Assignment title is required", 400);

  const dueAt = combineDueAt(payload?.dueDate, payload?.dueTime);
  if (!dueAt) throw new AppError("Valid dueDate is required", 400);

  const points = Number(payload?.points);
  if (!Number.isFinite(points) || points <= 0) {
    throw new AppError("Points must be a positive number", 400);
  }

  const statusRaw = String(payload?.status || "active").trim().toLowerCase();
  const status = statusRaw === "published" ? "active" : statusRaw;
  if (!["active", "closed", "draft"].includes(status)) {
    throw new AppError("Invalid status. Use active/closed/draft", 400);
  }

  const lateAllowedRaw = payload?.lateAllowed;
  const lateAllowed =
    typeof lateAllowedRaw === "boolean"
      ? lateAllowedRaw
      : ["true", "1", "yes"].includes(String(lateAllowedRaw || "").toLowerCase());

  const attachments = buildStoredFileMetaList(files, "assignments");

  const assignment = await Assignment.create({
    classId: cls._id,
    gradeId: cls.gradeId,
    subjectId: cls.subjectId,
    createdBy: cls.teacher, // teacher remains assignment owner for grading flows
    classInfo: {
      gradeLevel: cls.gradeLevel,
      gradeId: cls.gradeId || null,
      subject: cls.subject,
      subjectId: cls.subjectId || null,
      teacher: cls.teacher,
    },
    title,
    description: String(payload?.description || "").trim(),
    dueAt,
    points,
    attachments,
    status,
    lateAllowed,
  });

  return assignment;
};

export const updateAdminAssignment = async ({ assignmentId, payload, files, adminUser }) => {
  return updateAssignmentById({
    assignmentId,
    user: adminUser,
    payload,
    files,
  });
};

export const getAdminAssignmentSubmissions = async ({ assignmentId }) => {
  return adminAssignmentSubmissions({ assignmentId });
};
