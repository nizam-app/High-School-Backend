import mongoose from "mongoose";

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "dropped", "completed"],
      default: "active",
      index: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    droppedAt: {
      type: Date,
      default: null,
    },
    enrolledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

enrollmentSchema.index({ student: 1, class: 1 }, { unique: true });

const Enrollment = mongoose.model("Enrollment", enrollmentSchema);

export default Enrollment;
export { Enrollment };
