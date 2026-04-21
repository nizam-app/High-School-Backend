import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    submissionType: { type: String, enum: ["file", "text"], required: true },

    file: {
      originalName: String,
      mimeType: String,
      size: Number,
      storageKey: String,
      url: String,
    },

    textAnswer: { type: String },

    submittedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["pending", "submitted", "graded"], default: "pending" },

    grade: {
      score: Number,
      feedback: String,
      gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      gradedAt: Date,
    },
  },
  { timestamps: true }
);

submissionSchema.index({ assignmentId: 1, studentId: 1, submittedAt: -1 });

export const Submission = mongoose.model("Submission", submissionSchema);
