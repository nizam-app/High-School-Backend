import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    originalName: String,
    mimeType: String,
    size: Number,
    storageKey: String,
    url: String,
  },
  { _id: false }
);

const assignmentSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: "Grade", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    classInfo: {
      gradeLevel: { type: String, trim: true },
      gradeId: { type: mongoose.Schema.Types.ObjectId, ref: "Grade", default: null },
      subject: { type: String, trim: true },
      subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
      teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    dueAt: { type: Date, required: true }, // combined date+time
    points: { type: Number, required: true },

    attachments: { type: [attachmentSchema], default: [] },
    submissions: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Submission" }],
      default: [],
    },

    status: { type: String, enum: ["active", "closed", "draft"], default: "active" },
    lateAllowed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

assignmentSchema.index({ gradeId: 1, subjectId: 1, dueAt: 1 });

export const Assignment = mongoose.model("Assignment", assignmentSchema);
