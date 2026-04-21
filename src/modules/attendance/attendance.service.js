import mongoose from "mongoose";
import AppError from "../../utils/AppError.js";
import Attendance from "./attendance.model.js";
import ClassModel from "../class/class.model.js";
import User from "../user/user.model.js";

const VALID_STATUS = new Set(["Present", "Absent", "Late"]);

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
};

const toObjectId = (value, fieldName) => {
  const raw = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) throw new AppError(`${fieldName} is invalid`, 400);
  return raw;
};

const assertClassAccess = async ({ classId, user }) => {
  const cls = await ClassModel.findById(classId).select("teacher students").lean();
  if (!cls) throw new AppError("Class not found", 404);

  if (user.role === "teacher" && String(cls.teacher) !== String(user._id)) {
    throw new AppError("You can only manage attendance for your own class", 403);
  }

  return cls;
};

const parseDateInput = (dateInput) => {
  if (!dateInput) throw new AppError("date is required", 400);
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) throw new AppError("Invalid date", 400);
  return startOfDay(d);
};

const normalizeRecord = (record) => {
  const studentId = toObjectId(record?.studentId, "studentId");
  const statusRaw = String(record?.status || "Present").trim();
  const status = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase();
  if (!VALID_STATUS.has(status)) {
    throw new AppError("Invalid status. Use Present/Absent/Late", 400);
  }
  const notes = String(record?.notes || "").trim();
  return { studentId, status, notes, markedAt: new Date() };
};

export const upsertClassAttendance = async ({ classId, actor, payload }) => {
  const cls = await assertClassAccess({ classId, user: actor });
  const sheetDate = parseDateInput(payload?.date);
  const recordsInput = Array.isArray(payload?.records) ? payload.records : [];
  if (!recordsInput.length) throw new AppError("records must be a non-empty array", 400);

  const classStudents = new Set((cls.students || []).map((id) => String(id)));
  if (!classStudents.size) throw new AppError("No students assigned to this class", 400);

  const recordsMap = new Map();
  for (const r of recordsInput) {
    const normalized = normalizeRecord(r);
    if (!classStudents.has(String(normalized.studentId))) {
      throw new AppError(`Student ${normalized.studentId} is not in this class`, 400);
    }
    recordsMap.set(String(normalized.studentId), normalized);
  }

  const existing = await Attendance.findOne({
    classId,
    date: { $gte: sheetDate, $lt: endOfDay(sheetDate) },
  });

  if (!existing) {
    const created = await Attendance.create({
      classId,
      teacherId: cls.teacher,
      date: sheetDate,
      records: Array.from(recordsMap.values()),
    });
    return created;
  }

  const merged = new Map((existing.records || []).map((r) => [String(r.studentId), r]));
  for (const [sid, row] of recordsMap.entries()) merged.set(sid, row);
  existing.records = Array.from(merged.values());
  existing.teacherId = cls.teacher;
  await existing.save();
  return existing;
};

export const getClassAttendance = async ({ classId, actor, query }) => {
  await assertClassAccess({ classId, user: actor });

  const filter = { classId };
  if (query?.from || query?.to) {
    filter.date = {};
    if (query.from) {
      const from = new Date(query.from);
      if (Number.isNaN(from.getTime())) throw new AppError("Invalid from date", 400);
      filter.date.$gte = startOfDay(from);
    }
    if (query.to) {
      const to = new Date(query.to);
      if (Number.isNaN(to.getTime())) throw new AppError("Invalid to date", 400);
      filter.date.$lt = endOfDay(to);
    }
  }

  const rows = await Attendance.find(filter)
    .populate("records.studentId", "_id name gradeLevel")
    .sort({ date: -1 })
    .lean();

  return rows;
};

export const getStudentAttendanceSummary = async ({ studentId, actor, query }) => {
  const sid = toObjectId(studentId, "studentId");
  const student = await User.findById(sid).select("_id name role").lean();
  if (!student || student.role !== "student") throw new AppError("Student not found", 404);

  const dateMatch = {};
  if (query?.from) {
    const from = new Date(query.from);
    if (Number.isNaN(from.getTime())) throw new AppError("Invalid from date", 400);
    dateMatch.$gte = startOfDay(from);
  }
  if (query?.to) {
    const to = new Date(query.to);
    if (Number.isNaN(to.getTime())) throw new AppError("Invalid to date", 400);
    dateMatch.$lt = endOfDay(to);
  }

  const match = { "records.studentId": new mongoose.Types.ObjectId(sid) };
  if (Object.keys(dateMatch).length) match.date = dateMatch;

  const docs = await Attendance.aggregate([
    { $match: match },
    { $unwind: "$records" },
    { $match: { "records.studentId": new mongoose.Types.ObjectId(sid) } },
    {
      $lookup: {
        from: "classes",
        localField: "classId",
        foreignField: "_id",
        as: "cls",
      },
    },
    { $unwind: "$cls" },
    {
      $project: {
        classId: 1,
        date: 1,
        status: "$records.status",
        notes: "$records.notes",
        gradeLevel: "$cls.gradeLevel",
        subject: "$cls.subject",
        teacher: "$cls.teacher",
      },
    },
    { $sort: { date: -1 } },
  ]);

  if (actor.role === "teacher") {
    for (const row of docs) {
      if (String(row.teacher) !== String(actor._id)) {
        throw new AppError("You can only view attendance for your own class students", 403);
      }
    }
  }

  const summary = { Present: 0, Absent: 0, Late: 0 };
  for (const row of docs) {
    if (summary[row.status] !== undefined) summary[row.status] += 1;
  }
  const total = summary.Present + summary.Absent + summary.Late;

  return {
    student,
    totals: {
      ...summary,
      total,
      presentRate: total ? Math.round(((summary.Present + summary.Late) / total) * 10000) / 100 : 0,
    },
    records: docs,
  };
};
