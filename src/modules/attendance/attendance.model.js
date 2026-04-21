import mongoose from "mongoose";

const attendanceRecordSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["Present", "Absent", "Late"],
      default: "Present",
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const AttendanceSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    records: {
      type: [attendanceRecordSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Ensure a class only has one attendance sheet per day
AttendanceSchema.index({ classId: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ "records.studentId": 1, date: 1 });

const Attendance = mongoose.model("Attendance", AttendanceSchema);

export default Attendance;
