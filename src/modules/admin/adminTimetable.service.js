import mongoose from "mongoose";
import AppError from "../../utils/AppError.js";
import { TimetableSlot } from "../timetable/timetableSlot.model.js";
import User from "../user/user.model.js";
import ClassModel from "../class/class.model.js";
import { Subject } from "../subject/subject.model.js";
import { Grade } from "../grade/grade.model.js";
import { resolveGradeRef, resolveSubjectRef } from "../../utils/educationRefs.js";

const VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const normalize = (v) => String(v || "").trim();
const normalizeDay = (v) => normalize(v).toLowerCase();

const parseMin = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  const txt = normalize(value);
  if (!txt) return null;
  const [h, m] = txt.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const minutesToTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const syncClassScheduleFromTimetable = async (classRef) => {
  if (!classRef || !mongoose.Types.ObjectId.isValid(String(classRef))) return;

  const [cls, slots] = await Promise.all([
    ClassModel.findById(classRef),
    TimetableSlot.find({
      classRef,
      isActive: true,
      type: "class",
    })
      .sort({ day: 1, startMin: 1, endMin: 1 })
      .select("day startMin endMin")
      .lean(),
  ]);

  if (!cls) return;

  cls.schedule = slots.map((slot) => ({
    day: slot.day,
    startMin: slot.startMin,
    endMin: slot.endMin,
  }));

  await cls.save();
};

const ensureTeacher = async (teacherId) => {
  if (!mongoose.Types.ObjectId.isValid(String(teacherId || ""))) {
    throw new AppError("Invalid teacherId", 400);
  }
  const teacher = await User.findById(teacherId).lean();
  if (!teacher || teacher.role !== "teacher") {
    throw new AppError("Teacher not found", 404);
  }
  return teacher;
};

/**
 * Count students assigned to the same grade and subject (for timetable slot).
 */
const countStudentsForGradeAndSubject = async ({ gradeId, grade, subjectId, subject }) => {
  const gradeCondition =
    gradeId && String(gradeId).length === 24
      ? { $or: [{ gradeId }, { gradeLevel: grade || "" }] }
      : { gradeLevel: grade || "" };
  const subjectCondition =
    subjectId && String(subjectId).length === 24
      ? { $or: [{ assignedSubjectIds: subjectId }, { assignedSubjects: subject || "" }] }
      : { assignedSubjects: subject || "" };
  return User.countDocuments({
    role: "student",
    $and: [gradeCondition, subjectCondition],
  });
};

const assertConflictFree = async ({
  teacherId,
  grade,
  section,
  day,
  startMin,
  endMin,
  ignoreId,
}) => {
  const teacherConflict = await TimetableSlot.findOne({
    _id: ignoreId ? { $ne: ignoreId } : { $exists: true },
    teacher: teacherId,
    day,
    isActive: true,
    startMin: { $lt: endMin },
    endMin: { $gt: startMin },
  }).lean();

  if (teacherConflict) throw new AppError("Teacher has a timetable conflict in this timeslot", 409);

  const classConflict = await TimetableSlot.findOne({
    _id: ignoreId ? { $ne: ignoreId } : { $exists: true },
    grade,
    section: section || "",
    day,
    isActive: true,
    startMin: { $lt: endMin },
    endMin: { $gt: startMin },
  }).lean();

  if (classConflict) throw new AppError("Class has a timetable conflict in this timeslot", 409);
};

const toDateOnly = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

export const getAdminTimetable = async (query = {}) => {
  const mode = normalize(query.mode || "class").toLowerCase();
  if (!["general", "class"].includes(mode)) {
    throw new AppError("mode must be general or class", 400);
  }

  const requestDate = (() => {
    const raw = query.date ?? query.viewDate;
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  })();
  const requestDateTs = requestDate.getTime();

  const filter = { isActive: true };
  if (mode === "general") filter.type = "general";
  if (mode === "class") filter.type = "class";

  if (query.day) {
    const day = normalizeDay(query.day);
    if (!VALID_DAYS.includes(day)) throw new AppError("Invalid day", 400);
    filter.day = day;
  }

  if (query.classId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.classId))) throw new AppError("Invalid classId", 400);
    filter.classRef = query.classId;
  }

  if (query.gradeId) {
    const gradeRef = await resolveGradeRef({
      gradeId: query.gradeId,
      gradeLevel: query.grade,
      required: true,
    });
    filter.grade = gradeRef.gradeLevel;
  } else if (query.grade) {
    filter.grade = normalize(query.grade);
  }

  if (query.section) filter.section = normalize(query.section);

  const slots = await TimetableSlot.find(filter)
    .sort({ day: 1, startMin: 1, endMin: 1 })
    .populate("teacher", "name subject subjectId")
    .populate("classRef", "subject subjectId gradeLevel gradeId")
    .lean();

  const keyForRow = (row) =>
    `${row.classRef?.gradeId || ""}|${row.grade || ""}|${row.classRef?.subjectId || ""}|${(row.subject || "").trim()}`;
  const seen = new Set();
  const keys = [];
  for (const row of slots) {
    const k = keyForRow(row);
    if (!seen.has(k)) {
      seen.add(k);
      keys.push({
        gradeId: row.classRef?.gradeId,
        grade: row.grade,
        subjectId: row.classRef?.subjectId || row.teacher?.subjectId,
        subject: row.subject || row.classRef?.subject,
      });
    }
  }
  const keyString = (k) =>
    `${k.gradeId || ""}|${k.grade || ""}|${k.subjectId || ""}|${(k.subject || "").trim()}`;
  const countByKey = await Promise.all(keys.map((k) => countStudentsForGradeAndSubject(k))).then(
    (counts) => new Map(keys.map((k, i) => [keyString(k), counts[i]]))
  );

  // Normalize/enrich each slot; omit section and room; totalStudents = count by grade+subject
  // "Override for that day only": if effectiveDate !== request date, show original and isOverride false
  const data = slots.map((row) => {
    const gradeId = row.classRef?.gradeId || null;
    const gradeLevel = row.classRef?.gradeLevel || row.grade || null;
    const classId = row.classRef?._id || row.classRef || null;
    const totalStudents = countByKey.get(keyForRow(row)) ?? 0;

    const hasOverride = Boolean(row.isOverridden && row.effectiveDate);
    const effectiveDateTs = toDateOnly(row.effectiveDate);
    const showOverride = hasOverride && effectiveDateTs !== null && effectiveDateTs === requestDateTs;

    let subjectId, teacherId, subjectFromSlot, subjectName, teacherName, teacherSubject;
    let isOverride, isOverridden, overrideReason, reason, overriddenAt, overrideDate, effectiveDate;

    if (showOverride) {
      subjectId = row.classRef?.subjectId || row.teacher?.subjectId || null;
      teacherId = row.teacher?._id || row.teacher || null;
      subjectFromSlot = row.subject || row.classRef?.subject || null;
      subjectName = subjectFromSlot;
      teacherName = row.teacher?.name || null;
      teacherSubject = row.teacher?.subject || null;
      isOverride = true;
      isOverridden = true;
      overrideReason = row.overrideReason ?? "";
      reason = row.overrideReason ?? "";
      overriddenAt = row.overriddenAt ?? null;
      overrideDate = row.overriddenAt ?? null;
      effectiveDate = row.effectiveDate ?? null;
    } else {
      if (hasOverride && row.originalSubjectId != null) {
        subjectId = row.originalSubjectId;
      } else {
        subjectId = row.classRef?.subjectId || row.teacher?.subjectId || null;
      }
      if (hasOverride && row.originalTeacherId != null) {
        teacherId = row.originalTeacherId;
      } else {
        teacherId = row.teacher?._id || row.teacher || null;
      }
      subjectFromSlot = hasOverride ? (row.originalSubject || "") : (row.subject || row.classRef?.subject || null);
      subjectName = subjectFromSlot;
      teacherName = hasOverride ? (row.originalTeacherName || "") : (row.teacher?.name || null);
      teacherSubject = hasOverride ? "" : (row.teacher?.subject || null);
      isOverride = false;
      isOverridden = false;
      overrideReason = "";
      reason = "";
      overriddenAt = null;
      overrideDate = null;
      effectiveDate = null;
    }

    return {
      id: row._id,
      type: row.type,
      grade: gradeLevel,
      gradeId,
      classId,
      subjectId,
      teacherId,
      day: row.day,
      startMin: row.startMin,
      endMin: row.endMin,
      startTime: typeof row.startMin === "number" ? minutesToTime(row.startMin) : null,
      endTime: typeof row.endMin === "number" ? minutesToTime(row.endMin) : null,
      isActive: row.isActive,
      isOverridden,
      isOverride,
      overrideReason,
      reason,
      overriddenAt,
      overrideDate,
      effectiveDate,
      totalStudents,
      createdAt: row.createdAt ?? null,
      updatedAt: row.updatedAt ?? null,
      originalSubjectId: row.originalSubjectId ?? null,
      originalTeacherId: row.originalTeacherId ?? null,
      originalSubject: row.originalSubject ?? "",
      originalTeacherName: row.originalTeacherName ?? "",
      subject: subjectFromSlot,
      subjectName,
      teacherName,
      teacherSubject,
    };
  });

  const groupedByDay = VALID_DAYS.reduce((acc, d) => {
    acc[d] = [];
    return acc;
  }, {});

  for (const row of data) {
    if (!row.day) continue;
    if (!groupedByDay[row.day]) groupedByDay[row.day] = [];
    groupedByDay[row.day].push(row);
  }

  return { mode, data, groupedByDay };
};

export const createTimetableEntry = async (payload = {}, actorId = null) => {
  const type = normalize(payload.type || "class").toLowerCase();
  if (!["general", "class"].includes(type)) throw new AppError("type must be general or class", 400);

  const day = normalizeDay(payload.day);
  if (!VALID_DAYS.includes(day)) throw new AppError("day is invalid", 400);

  const startMin = parseMin(payload.startMin ?? payload.startTime);
  const endMin = parseMin(payload.endMin ?? payload.endTime);
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin) || endMin <= startMin) {
    throw new AppError("start/end time invalid", 400);
  }

  const teacherId = payload.teacherId || payload.teacher;
  await ensureTeacher(teacherId);

  const gradeRef = await resolveGradeRef({
    gradeId: payload.gradeId,
    gradeLevel: payload.grade || payload.gradeLevel,
    required: true,
  });

  const subjectRef = await resolveSubjectRef({
    subjectId: payload.subjectId,
    subject: payload.subject,
    required: true,
  });

  let classRef = null;
  if (type === "class" && !(payload.classId || payload.classRef)) {
    throw new AppError("classId is required for class timetable entries", 400);
  }
  if (payload.classId || payload.classRef) {
    const classId = payload.classId || payload.classRef;
    if (!mongoose.Types.ObjectId.isValid(String(classId))) throw new AppError("Invalid classId", 400);
    const cls = await ClassModel.findById(classId).lean();
    if (!cls) throw new AppError("Class not found", 404);
    classRef = cls._id;
  }

  const section = normalize(payload.section);
  await assertConflictFree({
    teacherId,
    grade: gradeRef.gradeLevel,
    section,
    day,
    startMin,
    endMin,
  });

  const overrideReason = normalize(payload.overrideReason ?? "");
  const isOverridden = Boolean(overrideReason || payload.isOverridden === true);

  const created = await TimetableSlot.create({
    type,
    grade: gradeRef.gradeLevel,
    section,
    classRef,
    subject: subjectRef.subject,
    teacher: teacherId,
    room: normalize(payload.room),
    day,
    startMin,
    endMin,
    isActive: payload.isActive === undefined ? true : Boolean(payload.isActive),
    isOverridden,
    overrideReason: overrideReason || undefined,
    createdBy: actorId,
    updatedBy: actorId,
  });

  await syncClassScheduleFromTimetable(classRef);

  const totalStudents = await countStudentsForGradeAndSubject({
    gradeId: gradeRef.gradeId,
    grade: gradeRef.gradeLevel,
    subjectId: subjectRef.subjectId,
    subject: subjectRef.subject,
  });

  const obj = created.toObject ? created.toObject() : created;
  const { section: _s, room: _r, ...rest } = obj;
  return { ...rest, totalStudents };
};

export const updateTimetableEntry = async (entryId, payload = {}, actorId = null) => {
  if (!mongoose.Types.ObjectId.isValid(String(entryId))) throw new AppError("Invalid entry id", 400);

  const slot = await TimetableSlot.findById(entryId);
  if (!slot) throw new AppError("Timetable entry not found", 404);
  const previousClassRef = slot.classRef ? String(slot.classRef) : null;

  const day = payload.day !== undefined ? normalizeDay(payload.day) : slot.day;
  if (!VALID_DAYS.includes(day)) throw new AppError("day is invalid", 400);

  const startMin =
    payload.startMin !== undefined || payload.startTime !== undefined
      ? parseMin(payload.startMin ?? payload.startTime)
      : slot.startMin;
  const endMin =
    payload.endMin !== undefined || payload.endTime !== undefined
      ? parseMin(payload.endMin ?? payload.endTime)
      : slot.endMin;
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin) || endMin <= startMin) {
    throw new AppError("start/end time invalid", 400);
  }

  const teacherId = payload.teacherId || payload.teacher || slot.teacher;
  await ensureTeacher(teacherId);

  const gradeRef = await resolveGradeRef({
    gradeId: payload.gradeId,
    gradeLevel: payload.grade || payload.gradeLevel || slot.grade,
    required: true,
  });

  const subjectRef = await resolveSubjectRef({
    subjectId: payload.subjectId,
    subject: payload.subject || slot.subject,
    required: true,
  });

  const nextType =
    payload.type !== undefined ? normalize(payload.type).toLowerCase() : slot.type;
  if (!["general", "class"].includes(nextType)) {
    throw new AppError("type must be general or class", 400);
  }

  let classRef = slot.classRef || null;
  if (payload.classId !== undefined || payload.classRef !== undefined) {
    const classId = payload.classId || payload.classRef;
    if (!classId) classRef = null;
    else {
      if (!mongoose.Types.ObjectId.isValid(String(classId))) throw new AppError("Invalid classId", 400);
      const cls = await ClassModel.findById(classId).lean();
      if (!cls) throw new AppError("Class not found", 404);
      classRef = cls._id;
    }
  }
  if (nextType === "class" && !classRef) {
    throw new AppError("classId is required for class timetable entries", 400);
  }

  const section = payload.section !== undefined ? normalize(payload.section) : slot.section;
  await assertConflictFree({
    teacherId,
    grade: gradeRef.gradeLevel,
    section,
    day,
    startMin,
    endMin,
    ignoreId: slot._id,
  });

  const isOverrideRequest =
    payload.isOverride === true ||
    payload.isOverridden === true ||
    (payload.reason && normalize(payload.reason)) ||
    (payload.overrideReason && normalize(payload.overrideReason));

  if (isOverrideRequest) {
    slot.isOverridden = true;
    slot.overrideReason = normalize(payload.reason ?? payload.overrideReason ?? "") || slot.overrideReason || "";
    slot.overriddenAt = new Date();
    const overrideDateRaw = payload.effectiveDate ?? payload.overrideDate;
    const effectiveDate = (() => {
      if (overrideDateRaw) {
        const d = new Date(overrideDateRaw);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(0, 0, 0, 0);
          return d;
        }
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    })();
    slot.effectiveDate = effectiveDate;
    slot.originalSubjectId = slot.classRef
      ? (await ClassModel.findById(slot.classRef).select("subjectId").lean())?.subjectId ?? null
      : null;
    slot.originalTeacherId = slot.teacher || null;
    slot.originalSubject = slot.subject || "";
    const prevTeacher = await User.findById(slot.teacher).select("name").lean();
    slot.originalTeacherName = prevTeacher?.name || "";
  }

  slot.type = nextType;
  slot.grade = gradeRef.gradeLevel;
  slot.section = section;
  slot.classRef = classRef;
  slot.subject = subjectRef.subject;
  slot.teacher = teacherId;
  if (payload.room !== undefined) slot.room = normalize(payload.room);
  slot.day = day;
  slot.startMin = startMin;
  slot.endMin = endMin;
  if (payload.isActive !== undefined) slot.isActive = Boolean(payload.isActive);
  if (payload.overrideReason !== undefined && !isOverrideRequest) {
    slot.overrideReason = normalize(payload.overrideReason);
    slot.isOverridden = Boolean(slot.overrideReason || payload.isOverridden === true);
  }
  if (payload.isOverridden !== undefined && !isOverrideRequest) slot.isOverridden = Boolean(payload.isOverridden);
  slot.updatedBy = actorId;

  await slot.save();
  if (previousClassRef && previousClassRef !== String(slot.classRef || "")) {
    await syncClassScheduleFromTimetable(previousClassRef);
  }
  await syncClassScheduleFromTimetable(slot.classRef);

  const totalStudents = await countStudentsForGradeAndSubject({
    gradeId: gradeRef.gradeId,
    grade: gradeRef.gradeLevel,
    subjectId: subjectRef.subjectId,
    subject: subjectRef.subject,
  });

  const obj = slot.toObject ? slot.toObject() : slot;
  const { section: _s, room: _r, ...rest } = obj;
  return {
    ...rest,
    totalStudents,
    isOverride: Boolean(slot.isOverridden),
    reason: slot.overrideReason ?? "",
    overriddenAt: slot.overriddenAt ?? null,
    overrideDate: slot.overriddenAt ?? null,
    effectiveDate: slot.effectiveDate ?? null,
  };
};

export const deleteTimetableEntry = async (entryId, hardDelete = false) => {
  if (!mongoose.Types.ObjectId.isValid(String(entryId))) throw new AppError("Invalid entry id", 400);

  const slot = await TimetableSlot.findById(entryId);
  if (!slot) throw new AppError("Timetable entry not found", 404);
  const classRef = slot.classRef ? String(slot.classRef) : null;

  if (hardDelete) {
    await TimetableSlot.findByIdAndDelete(entryId);
    await syncClassScheduleFromTimetable(classRef);
    return { deleted: true, mode: "hard", id: entryId };
  }

  slot.isActive = false;
  await slot.save();
  await syncClassScheduleFromTimetable(classRef);
  return { deleted: true, mode: "soft", id: entryId, isActive: false };
};

export const getTimetableMeta = async () => {
  const [teachers, subjects, grades, classes] = await Promise.all([
    User.find({ role: "teacher", status: "active" })
      .select("_id name subject subjectId assignedGrades assignedGradeIds")
      .sort({ name: 1 })
      .lean(),
    Subject.find({ isActive: true }).select("_id name code color").sort({ name: 1 }).lean(),
    Grade.find({ isActive: true }).select("_id label order sections").sort({ order: 1 }).lean(),
    ClassModel.find({ status: "active" })
      .select("_id subject subjectId gradeLevel gradeId teacher")
      .sort({ gradeLevel: 1, subject: 1 })
      .lean(),
  ]);

  return { teachers, subjects, grades, classes };
};
