import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    channel: {
      type: String,
      enum: ["push", "announcement", "automated"],
      default: "announcement",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high"],
      default: "normal",
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "sent", "cancelled"],
      default: "draft",
      index: true,
    },
    targetType: {
      type: String,
      enum: ["all", "roles", "grades", "classes", "users"],
      required: true,
      default: "all",
    },
    target: {
      roles: { type: [String], default: [] },
      grades: { type: [String], default: [] },
      classes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
    scheduledFor: {
      type: Date,
      default: null,
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    meta: {
      recipientCount: { type: Number, default: 0 },
      deliveredCount: { type: Number, default: 0 },
      readCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

notificationSchema.index({ status: 1, scheduledFor: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
export { Notification };
