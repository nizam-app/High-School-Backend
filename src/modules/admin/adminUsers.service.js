import mongoose from "mongoose";
import User from "../user/user.model.js";
import ClassModel from "../class/class.model.js";
import { Grade } from "../grade/grade.model.js";
import AppError from "../../utils/AppError.js";
import * as userService from "../user/user.service.js";
import { validateAdminCreateUserPayload } from "./adminUsers.validation.js";

const normalizeStr = (v) => String(v || "").trim();
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

const normalizeAdminUserPayload = (payload = {}) => {
  const rawGrade = payload.grade;
  let gradeId = normalizeStr(payload.gradeId || payload.grade_id);
  let gradeLevel = normalizeStr(payload.gradeLevel || payload.grade_label);

  if (gradeId && !isObjectId(gradeId)) {
    if (!gradeLevel) gradeLevel = gradeId;
    gradeId = "";
  }

  if (!gradeId && isObjectId(rawGrade)) {
    gradeId = String(rawGrade);
  } else if (!gradeLevel && rawGrade !== undefined && rawGrade !== null && !isObjectId(rawGrade)) {
    gradeLevel = normalizeStr(rawGrade);
  }

  const rawAssigned = payload.assignedGrades ?? payload.assignedGradeIds ?? payload.grades;
  let assignedGradeIds = payload.assignedGradeIds;
  let assignedGrades = payload.assignedGrades;

  if (Array.isArray(rawAssigned) && rawAssigned.length > 0) {
    const ids = rawAssigned.filter((v) => isObjectId(v)).map((v) => String(v));
    const labels = rawAssigned.filter((v) => !isObjectId(v)).map((v) => normalizeStr(v)).filter(Boolean);
    if (ids.length) assignedGradeIds = ids;
    if (labels.length) assignedGrades = labels;
  }

  return {
    ...payload,
    name: payload.name || payload.fullName,
    gradeId: gradeId || undefined,
    gradeLevel: gradeLevel || undefined,
    assignedGradeIds,
    assignedGrades,
  };
};

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

const normalizeRoleFilter = (role) => {
  const v = String(role || "").trim().toLowerCase();
  if (!v || v === "all") return null;
  if (v === "students") return "student";
  if (v === "teachers") return "teacher";
  if (["student", "teacher", "admin"].includes(v)) return v;
  throw new AppError("Invalid role filter", 400);
};

const normalizeStatusFilter = (status) => {
  const v = String(status || "").trim().toLowerCase();
  if (!v || v === "all") return null;
  if (v === "inactive") return "blocked";
  if (["active", "blocked"].includes(v)) return v;
  throw new AppError("Invalid status filter", 400);
};

const buildAssignedClassName = (cls) =>
  [String(cls?.gradeLevel || "").trim(), String(cls?.subject || "").trim()]
    .filter(Boolean)
    .join(" - ");

// OTP flow disabled — show all users (was: admin-created or OTP-verified only)
const getVisibleAdminUsersFilter = () => ({});
// const getVisibleAdminUsersFilter = () => ({
//   $or: [{ createdVia: "admin" }, { phoneVerified: true }],
// });

const buildAssignedClassesFromUser = (user) => {
  const role = String(user?.role || "").trim().toLowerCase();
  if (role === "student") {
    const gradeLevel = String(user?.gradeLevel || "").trim();
    const subjects = Array.isArray(user?.assignedSubjects) ? user.assignedSubjects : [];
    const classes = subjects
      .map((subject) => [gradeLevel, String(subject || "").trim()].filter(Boolean).join(" - "))
      .filter(Boolean);
    return Array.from(new Set(classes));
  }

  return [];
};

export const getAdminUsers = async (query = {}) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 20), 100);
  const skip = (page - 1) * limit;

  const role = normalizeRoleFilter(query.role);
  const status = normalizeStatusFilter(query.status);
  const search = String(query.search || "").trim();

  const filter = getVisibleAdminUsersFilter();
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: regex }, { phone: regex }, { email: regex }];
    // OTP flow disabled
    // filter.$and = [{ $or: [{ createdVia: "admin" }, { phoneVerified: true }] }];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  const teacherIds = users.filter((u) => u.role === "teacher").map((u) => u._id);
  const studentIds = users.filter((u) => u.role === "student").map((u) => u._id);

  const relatedClasses =
    teacherIds.length || studentIds.length
      ? await ClassModel.find({
          $or: [
            { teacher: { $in: teacherIds } },
            { students: { $in: studentIds } },
          ],
        })
          .select("_id gradeLevel subject teacher students")
          .lean()
      : [];

  const teacherClassMap = new Map();
  const studentClassMap = new Map();

  for (const cls of relatedClasses) {
    const clsName = buildAssignedClassName(cls);
    const teacherKey = String(cls.teacher);
    if (!teacherClassMap.has(teacherKey)) {
      teacherClassMap.set(teacherKey, new Set());
    }
    if (clsName) teacherClassMap.get(teacherKey).add(clsName);

    for (const studentId of cls.students || []) {
      const studentKey = String(studentId);
      if (!studentClassMap.has(studentKey)) {
        studentClassMap.set(studentKey, new Set());
      }
      if (clsName) studentClassMap.get(studentKey).add(clsName);
    }
  }

  const data = users.map((u) => {
    const key = String(u._id);
    const assignedClassesSet =
      u.role === "teacher" ? teacherClassMap.get(key) : studentClassMap.get(key);
    const assignedClassesFromUser = buildAssignedClassesFromUser(u);
    const assignedClassesFromClassLinks = assignedClassesSet ? Array.from(assignedClassesSet) : [];
    const assignedClasses =
      u.role === "teacher" ? assignedClassesFromClassLinks : assignedClassesFromUser;

    const base = {
      id: u._id,
      name: u.name,
      phone: u.phone,
      email: u.email || null,
      role: u.role,
      status: u.status,
      assignedClasses,
      assignedClassesCount: assignedClasses.length,
      createdVia: u.createdVia || null,
      joinDate: u.createdAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };

    if (u.role === "teacher") {
      return {
        ...base,
        subjectId: u.subjectId || null,
        subject: u.subject || null,
        assignedGradeIds: Array.isArray(u.assignedGradeIds) ? u.assignedGradeIds : [],
        assignedGrades: Array.isArray(u.assignedGrades) ? u.assignedGrades : [],
      };
    }

    if (u.role === "student") {
      return {
        ...base,
        gradeId: u.gradeId || null,
        gradeLevel: u.gradeLevel || null,
        assignedSubjectIds: Array.isArray(u.assignedSubjectIds) ? u.assignedSubjectIds : [],
        assignedSubjects: Array.isArray(u.assignedSubjects) ? u.assignedSubjects : [],
      };
    }

    return base;
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

export const getAdminUsersStats = async () => {
  const visibleUsersFilter = getVisibleAdminUsersFilter();
  const [totalStudents, totalTeachers, activeUsers, inactiveUsers] = await Promise.all([
    User.countDocuments({ ...visibleUsersFilter, role: "student" }),
    User.countDocuments({ ...visibleUsersFilter, role: "teacher" }),
    User.countDocuments({ ...visibleUsersFilter, status: "active" }),
    User.countDocuments({ ...visibleUsersFilter, status: "blocked" }),
  ]);

  return {
    totalStudents,
    totalTeachers,
    activeUsers,
    inactiveUsers,
    totalUsers: activeUsers + inactiveUsers,
  };
};

export const getCreateUserMeta = async () => {
  const grades = await Grade.find({ isActive: true }).sort({ order: 1, label: 1 }).lean();

  return {
    grades: grades.map((g) => ({
      id: g._id,
      label: g.label,
      value: String(g._id),
    })),
    gradeLabels: grades.map((g) => g.label),
  };
};

export const createAdminUser = async ({ payload, createdBy }) => {
  const normalized = normalizeAdminUserPayload(payload);
  await validateAdminCreateUserPayload(normalized);

  return userService.adminCreateUser({
    ...normalized,
    createdBy,
  });
};

export const updateAdminUser = async ({ userId, payload }) => {
  const normalized = normalizeAdminUserPayload(payload);
  return userService.updateUser(userId, normalized);
};

export const resetAdminUserPin = async ({ userId, pin }) => {
  return userService.resetUserPin(userId, pin);
};

export const updateAdminUserStatus = async ({ userId, status }) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (!normalizedStatus) throw new AppError("status is required", 400);

  const mappedStatus = normalizedStatus === "inactive" ? "blocked" : normalizedStatus;
  if (!["active", "blocked"].includes(mappedStatus)) {
    throw new AppError("Invalid status. Use active or blocked", 400);
  }

  return userService.updateUser(userId, { status: mappedStatus });
};

export const deleteAdminUser = async ({ userId }) => {
  return userService.deleteUser(userId);
};
