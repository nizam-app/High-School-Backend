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

const lessonSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: "Grade", required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // teacher/admin

    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    contentType: {
      type: String,
      enum: ["text", "pdf", "video", "image", "quiz"],
      required: true,
    },

    chapter: { type: String, required: true, trim: true },
    // classInfo: {
    //   gradeLevel: { type: String, trim: true },
    //   gradeId: { type: mongoose.Schema.Types.ObjectId, ref: "Grade", default: null },
    //   subject: { type: String, trim: true },
    //   subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
    //   teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // },

    date: { type: Date },

    files: { type: [attachmentSchema], default: [] },

    status: { type: String, enum: ["draft", "published"], default: "published" },
  },
  { timestamps: true }
);

lessonSchema.index({ gradeId: 1, subjectId: 1, createdAt: -1 });

export const Lesson = mongoose.model("Lesson", lessonSchema);
