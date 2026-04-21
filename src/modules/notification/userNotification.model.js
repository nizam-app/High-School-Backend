import mongoose from "mongoose";

const userNotificationSchema = new mongoose.Schema(
  {
    notification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deliveryStatus: {
      type: String,
      enum: ["queued", "sent", "failed"],
      default: "queued",
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
    failureReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

userNotificationSchema.index({ notification: 1, user: 1 }, { unique: true });
userNotificationSchema.index({ user: 1, createdAt: -1 });
userNotificationSchema.index({ user: 1, readAt: 1 });

const UserNotification =
  mongoose.models.UserNotification ||
  mongoose.model("UserNotification", userNotificationSchema, "notificationrecipients");

export default UserNotification;
export { UserNotification };
