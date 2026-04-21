import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    actorRole: {
      type: String,
      enum: ["student", "teacher", "admin", "system"],
      default: "system",
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    summary: {
      type: String,
      trim: true,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      trim: true,
      default: "",
    },
    userAgent: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;
export { ActivityLog };
