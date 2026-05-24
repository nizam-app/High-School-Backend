
import User from "./user.model.js";
import mongoose from "mongoose";
import AppError from "../../utils/AppError.js";
import ClassModel from "../class/class.model.js";
import { resolveSubjectRef, resolveSubjectRefs } from "../../utils/educationRefs.js";
import {
  resolveStudentGradeFromPayload,
  resolveTeacherGradesFromPayload,
} from "../../utils/gradeValidation.js";

// small helpers
const normalizeStr = (v) => String(v || "").trim();

const ALLOWED_ROLES = ["student", "teacher", "admin"];
const ALLOWED_STATUSES = ["active", "blocked"];
const ALLOWED_CREATED_VIA = ["signup", "admin"];
const isValidPin = (pin) => /^\d{4}$/.test(pin);

const assertPinEligibleRole = (role) => {
  const normalized = normalizeStr(role).toLowerCase();
  if (!["student", "teacher"].includes(normalized)) {
    throw new AppError("PIN can only be set for students and teachers", 400);
  }
};

const validatePinValue = (pin) => {
  const normalized = normalizeStr(pin);
  if (!normalized) throw new AppError("PIN is required", 400);
  if (!isValidPin(normalized)) throw new AppError("PIN must be exactly 4 digits", 400);
  return normalized;
};

const toRoleScopedUser = (doc) => {
  if (!doc) return doc;
  const user = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const role = String(user.role || "").trim().toLowerCase();

  if (role === "teacher") {
    delete user.gradeId;
    delete user.gradeLevel;
    delete user.assignedSubjects;
    delete user.assignedSubjectIds;
  } else if (role === "student") {
    delete user.subject;
    delete user.subjectId;
    delete user.assignedGrades;
    delete user.assignedGradeIds;
  }

  return user;
};

const syncStudentClasses = async ({
  studentId,
  gradeId,
  gradeLevel,
  assignedSubjectIds = [],
  assignedSubjects = [],
}) => {
  // Remove old links first
  await ClassModel.updateMany(
    { students: studentId },
    { $pull: { students: studentId } }
  );

  const normalizedGradeLevel = normalizeStr(gradeLevel);
  const subjectNames = Array.from(
    new Set((assignedSubjects || []).map((s) => normalizeStr(s)).filter(Boolean))
  );

  const subjectObjectIds = (assignedSubjectIds || [])
    .map((id) => normalizeStr(id))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!normalizedGradeLevel && !gradeId) return;
  if (subjectNames.length === 0 && subjectObjectIds.length === 0) return;

  const andFilters = [];

  if (gradeId && mongoose.Types.ObjectId.isValid(gradeId)) {
    const gId = new mongoose.Types.ObjectId(gradeId);
    if (normalizedGradeLevel) {
      andFilters.push({
        $or: [{ gradeId: gId }, { gradeLevel: normalizedGradeLevel }],
      });
    } else {
      andFilters.push({ gradeId: gId });
    }
  } else if (normalizedGradeLevel) {
    andFilters.push({ gradeLevel: normalizedGradeLevel });
  }

  const subjectOr = [];
  if (subjectNames.length) subjectOr.push({ subject: { $in: subjectNames } });
  if (subjectObjectIds.length) subjectOr.push({ subjectId: { $in: subjectObjectIds } });

  if (subjectOr.length === 1) andFilters.push(subjectOr[0]);
  if (subjectOr.length > 1) andFilters.push({ $or: subjectOr });

  if (andFilters.length === 0) return;

  await ClassModel.updateMany(
    { $and: andFilters },
    { $addToSet: { students: studentId } }
  );
};

// Admin/User list (optional filters: role, status)
export const getUsers = async (query = {}) => {
  const filter = {};

  if (query.role) {
    const role = normalizeStr(query.role).toLowerCase();
    if (!ALLOWED_ROLES.includes(role)) throw new AppError("Invalid role filter", 400);
    filter.role = role;
  }

  if (query.status) {
    const status = normalizeStr(query.status).toLowerCase();
    if (!ALLOWED_STATUSES.includes(status)) throw new AppError("Invalid status filter", 400);
    filter.status = status;
  }

  if (query.createdVia) {
    const createdVia = normalizeStr(query.createdVia).toLowerCase();
    if (!ALLOWED_CREATED_VIA.includes(createdVia)) {
      throw new AppError("Invalid createdVia filter", 400);
    }
    filter.createdVia = createdVia;
  }

  const users = await User.find(filter).sort({ createdAt: -1 }).lean();
  return users.map(toRoleScopedUser);
};

export const getUsersById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid user id", 400);

  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", 404);

  return toRoleScopedUser(user);
};

// Admin dashboard: create user (student/teacher only)
export const adminCreateUser = async (payload) => {
  const role = normalizeStr(payload?.role).toLowerCase();
  const name = normalizeStr(payload?.name || payload?.fullName);
  const email = normalizeStr(payload?.email).toLowerCase();
  const phone = normalizeStr(payload?.phone);
  const pin = normalizeStr(payload?.pin);

  let gradeId = null;
  let gradeLevel = "";
  if (role === "student") {
    const studentGrade = await resolveStudentGradeFromPayload(payload);
    gradeId = studentGrade.gradeId;
    gradeLevel = studentGrade.gradeLevel;
  }

  const { subjectId, subject } = await resolveSubjectRef({
    subjectId: payload?.subjectId,
    subject: payload?.subject,
    required: role === "teacher",
  });

  const { assignedGradeIds, assignedGrades } =
    role === "teacher"
      ? await resolveTeacherGradesFromPayload(payload)
      : { assignedGradeIds: [], assignedGrades: [] };

  const { assignedSubjectIds, assignedSubjects } = await resolveSubjectRefs({
    subjectIds: payload?.assignedSubjectIds,
    subjects: payload?.assignedSubjects,
  });

  if (!role || !["student", "teacher"].includes(role)) {
    throw new AppError("Role must be student or teacher", 400);
  }
  if (!name) throw new AppError("Name is required", 400);
  if (!phone) throw new AppError("Phone is required", 400);
  if (!pin) throw new AppError("PIN is required", 400);
  if (!isValidPin(pin)) throw new AppError("PIN must be exactly 4 digits", 400);

  if (role === "student" && !gradeId) {
    throw new AppError("Selected grade not found", 400);
  }

  if (role === "teacher") {
    if (!subject && !subjectId) throw new AppError("subject is required for teacher", 400);
  }

  // unique phone/email
  const phoneExists = await User.findOne({ phone });
  if (phoneExists) throw new AppError("Phone already exists", 409);

  if (email) {
    const emailExists = await User.findOne({ email });
    if (emailExists) throw new AppError("Email already exists", 409);
  }

  const user = await User.create({
    role,
    name,
    email: email || undefined,
    phone,
    pin,

    // student
    gradeId: role === "student" ? gradeId || null : undefined,
    gradeLevel: role === "student" ? gradeLevel : undefined,
    assignedSubjectIds: role === "student" ? assignedSubjectIds || [] : undefined,
    assignedSubjects: role === "student" ? assignedSubjects || [] : undefined,

    // teacher
    subjectId: role === "teacher" ? subjectId || null : undefined,
    subject: role === "teacher" ? subject : undefined,
    assignedGradeIds: role === "teacher" ? assignedGradeIds : undefined,
    assignedGrades: role === "teacher" ? assignedGrades : undefined,

    createdVia: "admin",
    createdBy: payload?.createdBy || null,
  });

  if (role === "student") {
    await syncStudentClasses({
      studentId: user._id,
      gradeId: user.gradeId,
      gradeLevel: user.gradeLevel,
      assignedSubjectIds: user.assignedSubjectIds || [],
      assignedSubjects: user.assignedSubjects || [],
    });
  }

  return toRoleScopedUser(user);
};

export const resetUserPin = async (id, pin) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid user id", 400);

  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", 404);

  assertPinEligibleRole(user.role);
  user.pin = validatePinValue(pin);
  await user.save();

  return toRoleScopedUser(user);
};

export const updateUser = async (id, payload) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid user id", 400);

  const existing = await User.findById(id);
  if (!existing) throw new AppError("User not found", 404);

  const update = {};

  // base fields
  if (payload?.name !== undefined) update.name = normalizeStr(payload.name);
  if (payload?.email !== undefined) update.email = normalizeStr(payload.email).toLowerCase();
  if (payload?.phone !== undefined) update.phone = normalizeStr(payload.phone);

  if (payload?.status !== undefined) {
    const st = normalizeStr(payload.status).toLowerCase();
    if (!ALLOWED_STATUSES.includes(st)) throw new AppError("Invalid status", 400);
    update.status = st;
  }

  const nextRole =
    payload?.role !== undefined ? normalizeStr(payload.role).toLowerCase() : existing.role;

  if (!ALLOWED_ROLES.includes(nextRole)) throw new AppError("Invalid role", 400);
  update.role = nextRole;

  let gradeRef = {
    gradeId: existing.gradeId,
    gradeLevel: existing.gradeLevel,
  };
  if (nextRole === "student") {
    const gradePayloadProvided =
      payload?.gradeId !== undefined ||
      payload?.gradeLevel !== undefined ||
      payload?.grade !== undefined;

    if (gradePayloadProvided) {
      gradeRef = await resolveStudentGradeFromPayload({
        gradeId: payload?.gradeId ?? existing.gradeId,
        gradeLevel: payload?.gradeLevel ?? existing.gradeLevel,
        grade: payload?.grade,
      });
    } else if (!existing.gradeId) {
      throw new AppError("Selected grade not found", 400);
    }
  }

  const subjectRef = await resolveSubjectRef({
    subjectId: payload?.subjectId !== undefined ? payload?.subjectId : existing.subjectId,
    subject: payload?.subject !== undefined ? payload?.subject : existing.subject,
    required: nextRole === "teacher",
  });

  let gradeRefs = {
    assignedGradeIds: existing.assignedGradeIds || [],
    assignedGrades: existing.assignedGrades || [],
  };
  if (
    nextRole === "teacher" &&
    (payload?.assignedGradeIds !== undefined || payload?.assignedGrades !== undefined)
  ) {
    gradeRefs = await resolveTeacherGradesFromPayload({
      assignedGradeIds:
        payload?.assignedGradeIds !== undefined
          ? payload.assignedGradeIds
          : existing.assignedGradeIds,
      assignedGrades:
        payload?.assignedGrades !== undefined ? payload.assignedGrades : existing.assignedGrades,
    });
  }

  const subjectRefs = await resolveSubjectRefs({
    subjectIds:
      payload?.assignedSubjectIds !== undefined
        ? payload?.assignedSubjectIds
        : existing.assignedSubjectIds,
    subjects:
      payload?.assignedSubjects !== undefined
        ? payload?.assignedSubjects
        : existing.assignedSubjects,
  });

  if (nextRole === "teacher") {
    if (!subjectRef.subject && !subjectRef.subjectId) {
      throw new AppError("subject is required for teacher", 400);
    }

    // Keep this required for assignment updates:
    if (!gradeRefs.assignedGrades || gradeRefs.assignedGrades.length === 0) {
      throw new AppError("Teacher must be assigned to at least one grade", 400);
    }

    update.subject = subjectRef.subject;
    update.subjectId = subjectRef.subjectId || null;
    update.assignedGrades = gradeRefs.assignedGrades;
    update.assignedGradeIds = gradeRefs.assignedGradeIds;

    // clear student-only fields
    update.gradeId = undefined;
    update.gradeLevel = undefined;
    update.assignedSubjectIds = undefined;
    update.assignedSubjects = undefined;
  }

  if (nextRole === "student") {
    if (!gradeRef.gradeId) {
      throw new AppError("Selected grade not found", 400);
    }

    update.gradeId = gradeRef.gradeId;
    update.gradeLevel = gradeRef.gradeLevel;
    update.assignedSubjectIds = subjectRefs.assignedSubjectIds || [];
    update.assignedSubjects = subjectRefs.assignedSubjects || [];

    // clear teacher-only fields
    update.subjectId = undefined;
    update.subject = undefined;
    update.assignedGradeIds = undefined;
    update.assignedGrades = undefined;
  }

  if (nextRole === "admin") {
    update.subjectId = undefined;
    update.subject = undefined;
    update.assignedGradeIds = undefined;
    update.assignedGrades = undefined;
    update.gradeId = undefined;
    update.gradeLevel = undefined;
    update.assignedSubjectIds = undefined;
    update.assignedSubjects = undefined;
  }

  // unique checks if changed
  if (update.phone && update.phone !== existing.phone) {
    const exists = await User.findOne({ phone: update.phone });
    if (exists) throw new AppError("Phone already exists", 409);
  }

  if (update.email && update.email !== existing.email) {
    const exists = await User.findOne({ email: update.email });
    if (exists) throw new AppError("Email already exists", 409);
  }

  let pinToSet = null;
  if (payload?.pin !== undefined) {
    assertPinEligibleRole(nextRole);
    pinToSet = validatePinValue(payload.pin);
  }

  const user = await User.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });

  if (nextRole === "student") {
    await syncStudentClasses({
      studentId: user._id,
      gradeId: user.gradeId,
      gradeLevel: user.gradeLevel,
      assignedSubjectIds: user.assignedSubjectIds || [],
      assignedSubjects: user.assignedSubjects || [],
    });
  }

  if (pinToSet !== null) {
    const userDoc = await User.findById(id);
    userDoc.pin = pinToSet;
    await userDoc.save();
    return toRoleScopedUser(userDoc);
  }

  return toRoleScopedUser(user);
};

export const deleteUser = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid user id", 400);

  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", 404);

  if (user.role === "teacher") {
    await ClassModel.updateMany({ teacher: id }, { $set: { status: "archived" } });
  }

  await User.findByIdAndDelete(id);

  // cleanup class memberships for deleted students
  await ClassModel.updateMany({ students: id }, { $pull: { students: id } });

  return toRoleScopedUser(user);
};

export const updateStudentAssignedSubjects = async (id, assignedSubjectsInput) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid user id", 400);

  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", 404);
  if (user.role !== "student") {
    throw new AppError("Assigned subjects can only be updated for students", 400);
  }

  const raw = Array.isArray(assignedSubjectsInput) ? assignedSubjectsInput : [];
  const subjectIds = raw
    .map((x) => normalizeStr(x))
    .filter((x) => mongoose.Types.ObjectId.isValid(x));
  const subjects = raw
    .map((x) => normalizeStr(x))
    .filter((x) => !mongoose.Types.ObjectId.isValid(x));

  const refs = await resolveSubjectRefs({
    subjectIds,
    subjects,
  });

  // subject assignment optional for student
  user.assignedSubjectIds = refs.assignedSubjectIds || [];
  user.assignedSubjects = refs.assignedSubjects || [];
  await user.save();

  await syncStudentClasses({
    studentId: user._id,
    gradeId: user.gradeId,
    gradeLevel: user.gradeLevel,
    assignedSubjectIds: user.assignedSubjectIds || [],
    assignedSubjects: user.assignedSubjects || [],
  });

  return toRoleScopedUser(user);
};
