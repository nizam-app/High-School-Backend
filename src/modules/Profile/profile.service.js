import mongoose from "mongoose";
import AppError from "../../utils/AppError.js";
import User from "../user/user.model.js";
import Profile from "./profile.model.js";
import ClassModel from "../class/class.model.js";
import { buildStudentClassAccessFilterForStudent, buildStudentAssignmentFilter } from "../../utils/studentClassAccess.js";
import { Assignment } from "../assignment/assignment.model.js";
import { Submission } from "../submisssion/submission.model.js";
import {
  calculateStudentAssignmentAttendance,
  isGradedStudentSubmission,
  pickLatestSubmissionPerAssignment,
} from "../../utils/studentAssignmentAttendance.js";
const USER_PROFILE_SELECT = "role name email phone status createdVia";

const normalizeStr = (v) => String(v || "").trim();
const normalizeMaybe = (v) => {
  if (v === null) return null;
  const s = normalizeStr(v);
  return s || undefined;
};
const normalizeAddress = (v) => String(v ?? "").trim();
const norm = (v) => String(v || "").trim().toLowerCase();

const getTeacherInfoFromPayload = (payload = {}, existing = {}) => ({
  department:
    payload?.teacherInfo?.department !== undefined
      ? normalizeMaybe(payload.teacherInfo.department)
      : payload?.department !== undefined
      ? normalizeMaybe(payload.department)
      : existing?.department,
  qualifications:
    payload?.teacherInfo?.qualifications !== undefined
      ? normalizeMaybe(payload.teacherInfo.qualifications)
      : payload?.qualifications !== undefined
      ? normalizeMaybe(payload.qualifications)
      : existing?.qualifications,
  officeHours:
    payload?.teacherInfo?.officeHours !== undefined
      ? normalizeMaybe(payload.teacherInfo.officeHours)
      : payload?.officeHours !== undefined
      ? normalizeMaybe(payload.officeHours)
      : existing?.officeHours,
  bio:
    payload?.teacherInfo?.bio !== undefined
      ? normalizeMaybe(payload.teacherInfo.bio)
      : payload?.bio !== undefined
      ? normalizeMaybe(payload.bio)
      : existing?.bio,
});

const getStudentInfoFromPayload = (payload = {}, existing = {}) => ({
  parentName:
    payload?.studentInfo?.parentName !== undefined
      ? normalizeMaybe(payload.studentInfo.parentName)
      : payload?.parentName !== undefined
      ? normalizeMaybe(payload.parentName)
      : existing?.parentName,
  parentPhone:
    payload?.studentInfo?.parentPhone !== undefined
      ? normalizeMaybe(payload.studentInfo.parentPhone)
      : payload?.parentPhone !== undefined
      ? normalizeMaybe(payload.parentPhone)
      : existing?.parentPhone,
  parentEmail:
    payload?.studentInfo?.parentEmail !== undefined
      ? normalizeMaybe(payload.studentInfo.parentEmail)
      : payload?.parentEmail !== undefined
      ? normalizeMaybe(payload.parentEmail)
      : existing?.parentEmail,
});

const normalizeAdditionalFields = (payload = {}, existing = {}) => ({
  address:
    payload.address !== undefined
      ? normalizeAddress(payload.address)
      : normalizeAddress(existing.address),
  profileImage:
    payload.profileImage !== undefined
      ? normalizeMaybe(payload.profileImage)
      : existing.profileImage,
});

const normalizeCommonFields = (payload = {}, existing = {}) => ({
  name:
    payload.name !== undefined
      ? normalizeMaybe(payload.name)
      : existing.name,
  email:
    payload.email !== undefined ? normalizeMaybe(payload.email) : existing.email,
  phone:
    payload.phone !== undefined ? normalizeMaybe(payload.phone) : existing.phone,
  address:
    payload.address !== undefined
      ? normalizeMaybe(payload.address)
      : existing.address,
  profileImage:
    payload.profileImage !== undefined
      ? normalizeMaybe(payload.profileImage)
      : existing.profileImage,
});

const toClientProfile = (profileDoc) => {
  if (!profileDoc) return profileDoc;
  const obj =
    typeof profileDoc.toObject === "function"
      ? profileDoc.toObject()
      : { ...profileDoc };

  // Identity should come from token / user object, not duplicated on profile root.
  delete obj.role;
  delete obj.name;
  delete obj.email;
  delete obj.phone;

  return obj;
};

const buildStudentProfileOverview = async (user) => {
  const studentId = user._id;
  const classFilter = await buildStudentClassAccessFilterForStudent(user, studentId);

  const classes = await ClassModel.find(classFilter)
    .select("_id subject gradeLevel teacher")
    .populate("teacher", "name")
    .lean();

  const assignmentFilter = await buildStudentAssignmentFilter(user, studentId);
  const assignments =
    assignmentFilter._id === null
      ? []
      : await Assignment.find(assignmentFilter).select("_id points").lean();

  const assignmentIds = assignments.map((assignment) => assignment._id);
  const submissions = assignmentIds.length
    ? await Submission.find({
        studentId,
        assignmentId: { $in: assignmentIds },
      })
        .select("assignmentId submittedAt createdAt grade status")
        .lean()
    : [];

  const latestSubs = pickLatestSubmissionPerAssignment(submissions);
  let totalScore = 0;
  let totalPoints = 0;
  let completedAssignments = 0;
  for (const assignment of assignments) {
    const submission = latestSubs.get(String(assignment._id));
    if (!submission) continue;
    completedAssignments += 1;
    if (isGradedStudentSubmission(submission)) {
      totalScore += Number(submission.grade?.score || 0);
      totalPoints += Number(assignment.points || 0);
    }
  }
  const averageGrade = totalPoints > 0 ? Math.round((totalScore / totalPoints) * 100) : 0;

  const {
    attendancePercentage: attendance,
    gradedSubmittedAssignments,
    totalAssignedAssignments,
  } = calculateStudentAssignmentAttendance(assignments, latestSubs);

  return {
    academicOverview: {
      totalClasses: classes.length,
      assignments: `${completedAssignments}/${assignments.length}`,
      averageGrade,
      attendance,
      gradedSubmittedAssignments,
      totalAssignedAssignments,
    },
    currentClasses: classes.map((cls) => ({
      classId: cls._id,
      subject: cls.subject,
      teacherName: cls?.teacher?.name || null,
    })),
  };
};

const buildTeacherProfileOverview = async (user) => {
  const teacherId = user._id;

  const classes = await ClassModel.find({ teacher: teacherId, status: "active" })
    .select("_id className subject gradeLevel students")
    .lean();
  const classIds = classes.map((cls) => cls._id);

  const uniqueStudents = new Set();
  for (const cls of classes) {
    for (const studentId of Array.isArray(cls.students) ? cls.students : []) {
      uniqueStudents.add(String(studentId));
    }
  }

  const assignments = await Assignment.find({ createdBy: teacherId })
    .select("_id classId")
    .lean();
  const assignmentIds = assignments.map((assignment) => assignment._id);
  const submissions = assignmentIds.length
    ? await Submission.find({ assignmentId: { $in: assignmentIds } })
        .select("assignmentId studentId submittedAt createdAt grade")
        .lean()
    : [];

  const latestByStudentAssignment = new Map();
  for (const submission of submissions) {
    const key = `${String(submission.assignmentId)}:${String(submission.studentId)}`;
    const existing = latestByStudentAssignment.get(key);
    if (
      !existing ||
      new Date(submission.submittedAt || submission.createdAt || 0) >
        new Date(existing.submittedAt || existing.createdAt || 0)
    ) {
      latestByStudentAssignment.set(key, submission);
    }
  }

  let gradedSubmissions = 0;
  for (const submission of latestByStudentAssignment.values()) {
    if (submission?.grade?.gradedAt) gradedSubmissions += 1;
  }

  return {
    teachingOverview: {
      totalClasses: classes.length,
      totalStudents: uniqueStudents.size,
      totalAssignments: assignments.length,
      totalGradedSubmissions: gradedSubmissions,
    },
    assignedClasses: classes.map((cls) => ({
      classId: cls._id,
      className: cls.className || `${cls.subject} - ${cls.gradeLevel}`,
      subject: cls.subject,
      gradeLevel: cls.gradeLevel,
      totalStudents: Array.isArray(cls.students) ? cls.students.length : 0,
    })),
  };
};

const withPopulatedUser = async (profileDoc) => {
  if (!profileDoc) return profileDoc;

  if (typeof profileDoc.populate === "function") {
    await profileDoc.populate("user", USER_PROFILE_SELECT);
    return profileDoc;
  }

  const obj = { ...profileDoc };
  const hasPopulatedUser = obj.user && typeof obj.user === "object" && obj.user._id;
  if (!hasPopulatedUser && obj.user) {
    obj.user = await User.findById(obj.user).select(USER_PROFILE_SELECT).lean();
  }
  return obj;
};

const validateRoleSpecificPayload = (role, teacherInfo, studentInfo) => {
  if (role === "teacher") {
    if (
      !teacherInfo?.department ||
      !teacherInfo?.qualifications ||
      !teacherInfo?.officeHours ||
      !teacherInfo?.bio
    ) {
      throw new AppError(
        "Teacher profile requires: department, qualifications, officeHours, bio",
        400
      );
    }
  }

  if (role === "student") {
    if (
      !studentInfo?.parentName ||
      !studentInfo?.parentPhone ||
      !studentInfo?.parentEmail
    ) {
      throw new AppError(
        "Student profile requires: parentName, parentPhone, parentEmail",
        400
      );
    }
  }
};

const syncProfileIdentity = ({ profile, user }) => {
  let dirty = false;

  if (String(profile.role || "") !== String(user.role || "")) {
    profile.role = user.role;
    dirty = true;
  }
  if (String(profile.name || "") !== String(user.name || "")) {
    profile.name = user.name || "";
    dirty = true;
  }
  if (String(profile.phone || "") !== String(user.phone || "")) {
    profile.phone = user.phone || "";
    dirty = true;
  }

  const profileEmail = String(profile.email || "").toLowerCase();
  const userEmail = String(user.email || "").toLowerCase();
  if (profileEmail !== userEmail) {
    profile.email = user.email || undefined;
    dirty = true;
  }

  return dirty;
};

const ensureProfileForUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  let profile = await Profile.findOne({ user: userId });
  if (!profile) {
    profile = await Profile.create({
      user: user._id,
      role: user.role,
      name: user.name || "",
      email: user.email || undefined,
      phone: user.phone || "",
      address: "Not provided",
      profileImage: null,
    });
  } else {
    const dirty = syncProfileIdentity({ profile, user });
    if (dirty) {
      // Legacy profiles may be missing newer required fields like address.
      // For read paths, keep identity fields in sync without blocking on full validation.
      await profile.save({ validateBeforeSave: false });
    }
  }

  return { user, profile };
};

const createProfileForUser = async (userId, payload = {}) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  const exists = await Profile.findOne({ user: userId });
  if (exists) throw new AppError("Profile already exists for this user", 409);

  const common = normalizeCommonFields(payload, {
    name: user.name,
    phone: user.phone,
  });

  if (!common.name || !common.email || !common.phone || !common.address) {
    throw new AppError(
      "name, email, phone, and address are required",
      400
    );
  }

  const doc = {
    user: user._id,
    role: user.role,
    name: common.name,
    email: common.email,
    phone: common.phone,
    address: common.address,
    profileImage: common.profileImage || null,
  };

  if (user.role === "teacher") {
    doc.teacherInfo = getTeacherInfoFromPayload(payload);
  }

  if (user.role === "student") {
    doc.studentInfo = getStudentInfoFromPayload(payload);
  }

  validateRoleSpecificPayload(user.role, doc.teacherInfo, doc.studentInfo);

  const profile = await Profile.create(doc);
  return profile;
};

export const createMyProfile = async (userId, payload = {}) => {
  const profile = await createProfileForUser(userId, payload);
  return toClientProfile(await withPopulatedUser(profile));
};

export const createProfileByUserId = async (userId, payload = {}) => {
  const profile = await createProfileForUser(userId, payload);
  return toClientProfile(await withPopulatedUser(profile));
};

export const getMyProfile = async (userId) => {
  const { user, profile } = await ensureProfileForUser(userId);
  const baseProfile = toClientProfile(await withPopulatedUser(profile));

  if (user.role === "student") {
    const studentOverview = await buildStudentProfileOverview(user);
    return {
      ...baseProfile,
      ...studentOverview,
    };
  }

  if (user.role === "teacher") {
    const teacherOverview = await buildTeacherProfileOverview(user);
    return {
      ...baseProfile,
      ...teacherOverview,
    };
  }

  return baseProfile;
};

export const updateMyProfile = async (userId, payload = {}) => {
  const { user, profile } = await ensureProfileForUser(userId);

  const extra = normalizeAdditionalFields(payload, profile);
  profile.address = extra.address;
  profile.profileImage = extra.profileImage || null;

  if (user.role === "teacher") {
    profile.teacherInfo = getTeacherInfoFromPayload(payload, profile.teacherInfo || {});
    profile.studentInfo = undefined;
  } else if (user.role === "student") {
    profile.studentInfo = getStudentInfoFromPayload(payload, profile.studentInfo || {});
    profile.teacherInfo = undefined;
  } else {
    profile.teacherInfo = undefined;
    profile.studentInfo = undefined;
  }

  await profile.save();
  return toClientProfile(await withPopulatedUser(profile));
};

export const deleteMyProfile = async (userId) => {
  const profile = await Profile.findOneAndDelete({ user: userId });
  if (!profile) throw new AppError("Profile not found", 404);
  return toClientProfile(await withPopulatedUser(profile));
};

export const getAllProfiles = async (query = {}) => {
  const filter = {};
  if (query?.role) {
    const role = normalizeStr(query.role).toLowerCase();
    if (!["student", "teacher", "admin"].includes(role)) {
      throw new AppError("Invalid role filter", 400);
    }
    filter.role = role;
  }

  const profiles = await Profile.find(filter)
    .sort({ createdAt: -1 })
    .populate("user", USER_PROFILE_SELECT);
  return profiles.map(toClientProfile);
};

export const getProfileById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid profile id", 400);
  }

  const profile = await Profile.findById(id).populate(
    "user",
    USER_PROFILE_SELECT
  );
  if (!profile) throw new AppError("Profile not found", 404);
  return toClientProfile(profile);
};

export const updateProfileById = async (id, payload = {}, actor = null) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid profile id", 400);
  }

  if (actor?.role && actor.role !== "admin") {
    throw new AppError("Only admin can update profiles by id", 403);
  }

  const profile = await Profile.findById(id);
  if (!profile) throw new AppError("Profile not found", 404);

  const common = normalizeCommonFields(payload, profile);
  profile.name = common.name;
  profile.email = common.email;
  profile.phone = common.phone;
  profile.address = common.address;
  profile.profileImage = common.profileImage || null;

  if (profile.role === "teacher") {
    profile.teacherInfo = getTeacherInfoFromPayload(payload, profile.teacherInfo);
  }

  if (profile.role === "student") {
    profile.studentInfo = getStudentInfoFromPayload(payload, profile.studentInfo);
  }

  validateRoleSpecificPayload(
    profile.role,
    profile.teacherInfo,
    profile.studentInfo
  );

  await profile.save();
  return toClientProfile(await withPopulatedUser(profile));
};

export const deleteProfileById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid profile id", 400);
  }

  const profile = await Profile.findByIdAndDelete(id);
  if (!profile) throw new AppError("Profile not found", 404);
  return toClientProfile(await withPopulatedUser(profile));
};
