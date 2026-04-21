import jwt from "jsonwebtoken";
import env from "../../config/env.js";
import AppError from "../../utils/AppError.js";
import { User } from "../user/user.model.js";
import {
  resolveGradeRef,
  resolveGradeRefs,
  resolveSubjectRef,
  resolveSubjectRefs,
} from "../../utils/educationRefs.js";

const getJwtExpiry = () => {
  const v = String(env.JWT_ACCESS_EXPIRES_IN || "").trim();
  if (!v) return "7d";
  if (/^\d+$/.test(v)) return Number(v); // seconds
  if (/^\d+(s|m|h|d)$/i.test(v)) return v.toLowerCase();
  return "7d";
};

export const signAccessToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_SECRET, {
    expiresIn: getJwtExpiry(),
  });

const normalizePhone = (phone) => String(phone || "").trim();
const isValidPin = (pin) => /^[0-9]{4}$/.test(String(pin || ""));
const isPhoneVerifiedValue = (value) => {
  if (value === true) return true;
  if (value === 1) return true;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const allowedGrades = ["4th", "5th", "6th", "7th"];
export const isPrivilegedRole = (role) =>
  ["admin", "super_admin", "superadmin"].includes(String(role || "").trim().toLowerCase());

export const toRoleScopedAuthUser = (user) => {
  const base = {
    id: user._id,
    role: user.role,
    name: user.name,
    phone: user.phone,
    email: user.email || null,
    status: user.status || "active",
    phoneVerified: isPhoneVerifiedValue(user.phoneVerified),
    createdVia: user.createdVia || null,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    twoFactorEnabledAt: user.twoFactorEnabledAt || null,
  };

  if (user.role === "student") {
    return {
      ...base,
      gradeId: user.gradeId || null,
      gradeLevel: user.gradeLevel || null,
      assignedSubjectIds: user.assignedSubjectIds || [],
      assignedSubjects: user.assignedSubjects || [],
    };
  }

  if (user.role === "teacher") {
    return {
      ...base,
      subjectId: user.subjectId || null,
      subject: user.subject || null,
      assignedGradeIds: user.assignedGradeIds || [],
      assignedGrades: user.assignedGrades || [],
    };
  }

  return base;
};

export const registerService = async (payload) => {
  if (payload?.password !== undefined || payload?.confirmPassword !== undefined) {
    throw new AppError("Use pin/confirmPin (exactly 4 digits). password is not supported", 400);
  }

  const role = String(payload?.role || "student").trim().toLowerCase();
  if (!["student", "teacher", "admin"].includes(role)) {
    throw new AppError("Invalid role. Allowed roles: student, teacher, admin", 400);
  }

  const name = String(payload?.name || "").trim();
  const phone = normalizePhone(payload?.phone);

  const pin = String(payload?.pin || "").trim();
  const confirmPin = String(payload?.confirmPin || "").trim();

  const {
    gradeId,
    gradeLevel,
  } = await resolveGradeRef({
    gradeId: payload?.gradeId,
    gradeLevel: payload?.gradeLevel,
    required: role === "student",
  });

  const {
    subjectId,
    subject,
  } = await resolveSubjectRef({
    subjectId: payload?.subjectId,
    subject: payload?.subject,
    required: role === "teacher",
  });

  const { assignedGradeIds, assignedGrades } = await resolveGradeRefs({
    gradeIds: payload?.assignedGradeIds,
    gradeLevels: payload?.assignedGrades,
  });
  const { assignedSubjectIds, assignedSubjects } = await resolveSubjectRefs({
    subjectIds: payload?.assignedSubjectIds,
    subjects: payload?.assignedSubjects,
  });

  if (!name) throw new AppError("Full name is required", 400);
  if (!phone) throw new AppError("Phone number is required", 400);

  if (!isValidPin(pin)) throw new AppError("PIN must be 4 digits", 400);
  if (pin !== confirmPin) throw new AppError("PIN and Confirm PIN do not match", 400);

  //  Role validations (match your schema)
  if (role === "student") {
    if (!gradeLevel) throw new AppError("Grade is required for student", 400);
    if (!allowedGrades.includes(gradeLevel)) {
      throw new AppError(`Grade must be one of: ${allowedGrades.join(", ")}`, 400);
    }
    if (assignedSubjects.length === 0) {
      throw new AppError("Student must be assigned to at least one subject", 400);
    }
  }

  if (role === "teacher") {
    if (!subject && !subjectId) throw new AppError("Subject is required for teacher", 400);
    if (assignedGrades.length === 0) {
      throw new AppError("Teacher must be assigned to at least one grade", 400);
    }
    for (const g of assignedGrades) {
      if (!allowedGrades.includes(g)) {
        throw new AppError(`assignedGrades contains invalid grade: ${g}`, 400);
      }
    }
  }

  const exists = await User.findOne({ phone });
  if (exists) throw new AppError("Phone already exists", 409);

  // Registration does not require OTP; user must verify phone before first login.

  //  Create payload that satisfies schema validators
  const createPayload = {
    role,
    name,
    phone,
    pin,
    createdVia: "signup",
    phoneVerified: false,
  };

  if (role === "student") {
    createPayload.gradeId = gradeId || null;
    createPayload.gradeLevel = gradeLevel;
    createPayload.assignedSubjectIds = assignedSubjectIds;
    createPayload.assignedSubjects = assignedSubjects;
  }

  if (role === "teacher") {
    createPayload.subjectId = subjectId || null;
    createPayload.subject = subject;
    createPayload.assignedGradeIds = assignedGradeIds;
    createPayload.assignedGrades = assignedGrades;
  }

  const user = await User.create(createPayload);

  const token = signAccessToken(user);

  return {
    token,
    user: toRoleScopedAuthUser(user),
  };
};

export const loginService = async (payload) => {
  if (payload?.password !== undefined) {
    throw new AppError("Use pin (exactly 4 digits). password is not supported", 400);
  }

  const phone = normalizePhone(payload?.phone);
  const pin = String(payload?.pin || "").trim();

  if (!phone || !pin) throw new AppError("Phone and PIN required", 400);
  if (!isValidPin(pin)) throw new AppError("Invalid PIN format", 400);

  const user = await User.findOne({ phone }).select(
    "name role phone email status phoneVerified createdVia gradeId gradeLevel assignedSubjectIds assignedSubjects subjectId subject assignedGradeIds assignedGrades twoFactorEnabled twoFactorEnabledAt +twoFactorSecret +pin"
  );
  if (!user) throw new AppError("Invalid credentials", 401);
  if (user.status === "blocked") throw new AppError("Account is blocked", 403);

  const ok = await user.comparePin(pin);
  if (!ok) throw new AppError("Invalid credentials", 401);

  // All users must verify phone via OTP before they can log in
  if (!isPhoneVerifiedValue(user.phoneVerified)) {
    throw new AppError(
      "Phone number must be verified via OTP before login. Use /otp/send then /otp/verify",
      403
    );
  }

  const token = signAccessToken(user);

  return {
    requiresTwoFactor: false,
    token,
    user: toRoleScopedAuthUser(user),
  };
};

export const meService = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  return toRoleScopedAuthUser(user);
};
