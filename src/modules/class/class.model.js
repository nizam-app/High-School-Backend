
import mongoose from "mongoose";

const scheduleSlotSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ["sat", "sun", "mon", "tue", "wed", "thu", "fri"],
      required: true,
    },
    startMin: { type: Number, required: true }, // e.g. 9:30 => 570
    endMin: { type: Number, required: true },   // must be > startMin
  },
  { _id: false }
);

const classSchema = new mongoose.Schema(
  {
    className: { type: String, trim: true, default: "" },

    subject: { type: String, required: true, trim: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },

    gradeLevel: {
      type: String,
      enum: ["4th", "5th", "6th", "7th"],
      required: true,
    },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: "Grade", default: null },

    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    teacherName: { type: String, trim: true, default: "" },

    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    maxStudents: { type: Number },

    //  NEW: schedule (teacher can't overlap)
    schedule: { type: [scheduleSlotSchema], default: [] },

    status: { type: String, enum: ["active", "archived"], default: "active" },
  },
  { timestamps: true }
);

// prevent duplicate class for same teacher+grade+subject
classSchema.index({ subject: 1, gradeLevel: 1, teacher: 1 }, { unique: true });

// optional helper index for conflicts
classSchema.index({ teacher: 1, status: 1 });

const Class = mongoose.model("Class", classSchema);
export default Class;
