import mongoose from "mongoose";
import cron from "node-cron";
import AppError from "../../utils/AppError.js";
import Notification from "./notification.model.js";
import UserNotification from "./userNotification.model.js";
import User from "../user/user.model.js";
import ClassModel from "../class/class.model.js";
import { emitToAdmins, emitToUser } from "../../socket/socket.js";

const VALID_CHANNELS = ["push", "announcement", "automated"];
const VALID_PRIORITIES = ["low", "normal", "high"];
const VALID_STATUSES = ["draft", "scheduled", "sent", "cancelled"];
const VALID_TARGET_TYPES = ["all", "roles", "grades", "classes", "users"];
const VALID_ROLES = ["student", "teacher", "admin"];

const normalize = (value) => String(value || "").trim();

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || "").trim());

const asObjectIds = (values = []) =>
  values
    .map((value) => String(value || "").trim())
    .filter((value) => isObjectId(value))
    .map((value) => new mongoose.Types.ObjectId(value));

const normalizeChannel = (channel) => {
  const value = normalize(channel).toLowerCase();
  if (!value) return "announcement";
  if (!VALID_CHANNELS.includes(value)) throw new AppError("Invalid channel", 400);
  return value;
};

const normalizePriority = (priority) => {
  const value = normalize(priority).toLowerCase();
  if (!value) return "normal";
  if (!VALID_PRIORITIES.includes(value)) throw new AppError("Invalid priority", 400);
  return value;
};

const normalizeStatus = (status, fallback = "draft") => {
  const value = normalize(status).toLowerCase();
  if (!value) return fallback;
  if (!VALID_STATUSES.includes(value)) throw new AppError("Invalid status", 400);
  return value;
};

const normalizeRoles = (roles = []) => {
  const normalized = Array.from(
    new Set(
      (Array.isArray(roles) ? roles : [])
        .map((role) => normalize(role).toLowerCase())
        .filter(Boolean)
    )
  );
  for (const role of normalized) {
    if (!VALID_ROLES.includes(role)) throw new AppError(`Invalid role target: ${role}`, 400);
  }
  return normalized;
};

const normalizeTarget = (targetType, input = {}) => {
  const roles = normalizeRoles(input.roles || []);
  const grades = Array.from(
    new Set((Array.isArray(input.grades) ? input.grades : []).map((value) => normalize(value)).filter(Boolean))
  );
  const classes = Array.from(
    new Set((Array.isArray(input.classes) ? input.classes : []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  const users = Array.from(
    new Set((Array.isArray(input.users) ? input.users : []).map((value) => String(value || "").trim()).filter(Boolean))
  );

  if (targetType === "roles" && roles.length === 0) {
    throw new AppError("target.roles is required for targetType=roles", 400);
  }
  if (targetType === "grades" && grades.length === 0) {
    throw new AppError("target.grades is required for targetType=grades", 400);
  }
  if (targetType === "classes" && classes.length === 0) {
    throw new AppError("target.classes is required for targetType=classes", 400);
  }
  if (targetType === "users" && users.length === 0) {
    throw new AppError("target.users is required for targetType=users", 400);
  }

  return {
    roles,
    grades,
    classes: classes.filter((value) => isObjectId(value)).map((value) => new mongoose.Types.ObjectId(value)),
    users: users.filter((value) => isObjectId(value)).map((value) => new mongoose.Types.ObjectId(value)),
  };
};

const normalizeTargetType = (targetType) => {
  const value = normalize(targetType || "all").toLowerCase();
  if (!VALID_TARGET_TYPES.includes(value)) throw new AppError("Invalid targetType", 400);
  return value;
};

const parseScheduledFor = (value, required = false) => {
  if (value === undefined || value === null || value === "") {
    if (required) throw new AppError("scheduledFor is required", 400);
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("Invalid scheduledFor date", 400);
  return date;
};

const computeRate = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

const buildUserVisibilityFilter = () => ({
  status: "active",
  $or: [{ createdVia: "admin" }, { phoneVerified: true }],
});

const resolveTargetUsers = async ({ targetType, target }) => {
  const visibleFilter = buildUserVisibilityFilter();

  if (targetType === "all") {
    const users = await User.find(visibleFilter).select("_id").lean();
    return users.map((row) => row._id);
  }

  if (targetType === "roles") {
    const users = await User.find({
      ...visibleFilter,
      role: { $in: target.roles },
    })
      .select("_id")
      .lean();
    return users.map((row) => row._id);
  }

  if (targetType === "grades") {
    const gradeObjectIds = target.grades.filter((value) => isObjectId(value));
    const gradeLabels = target.grades.filter((value) => !isObjectId(value));
    const users = await User.find({
      ...visibleFilter,
      role: "student",
      $or: [
        gradeLabels.length ? { gradeLevel: { $in: gradeLabels } } : null,
        gradeObjectIds.length ? { gradeId: { $in: asObjectIds(gradeObjectIds) } } : null,
      ].filter(Boolean),
    })
      .select("_id")
      .lean();
    return users.map((row) => row._id);
  }

  if (targetType === "classes") {
    const classes = await ClassModel.find({ _id: { $in: target.classes } })
      .select("teacher students")
      .lean();
    const ids = new Set();
    for (const row of classes) {
      if (row.teacher) ids.add(String(row.teacher));
      for (const studentId of row.students || []) ids.add(String(studentId));
    }
    return Array.from(ids)
      .filter((value) => isObjectId(value))
      .map((value) => new mongoose.Types.ObjectId(value));
  }

  if (targetType === "users") {
    const users = await User.find({
      ...visibleFilter,
      _id: { $in: target.users },
    })
      .select("_id")
      .lean();
    return users.map((row) => row._id);
  }

  throw new AppError("Invalid targetType", 400);
};

const buildCreatePayload = (payload = {}, actorId) => {
  const title = normalize(payload.title);
  const message = normalize(payload.message);
  if (!title) throw new AppError("title is required", 400);
  if (!message) throw new AppError("message is required", 400);

  const targetType = normalizeTargetType(payload.targetType || payload?.target?.type);
  const target = normalizeTarget(targetType, {
    roles: payload?.target?.roles ?? payload.roles,
    grades: payload?.target?.grades ?? payload.grades,
    classes: payload?.target?.classes ?? payload.classes,
    users: payload?.target?.users ?? payload.users,
  });

  let status = normalizeStatus(payload.status, "draft");
  if (payload.sendNow === true) status = "sent";
  if (payload.schedule === true) status = "scheduled";
  if (payload.saveDraft === true) status = "draft";

  const scheduledFor = status === "scheduled" ? parseScheduledFor(payload.scheduledFor, true) : parseScheduledFor(payload.scheduledFor, false);

  return {
    title,
    message,
    channel: normalizeChannel(payload.channel),
    priority: normalizePriority(payload.priority),
    status,
    targetType,
    target,
    scheduledFor,
    createdBy: actorId,
    updatedBy: actorId,
  };
};

const toAdminNotificationSummary = (notification) => ({
  id: notification._id,
  title: notification.title,
  message: notification.message,
  channel: notification.channel,
  priority: notification.priority,
  status: notification.status,
  targetType: notification.targetType,
  target: notification.target || {},
  scheduledFor: notification.scheduledFor,
  sentAt: notification.sentAt,
  recipientCount: notification.meta?.recipientCount || 0,
  deliveredCount: notification.meta?.deliveredCount || 0,
  readCount: notification.meta?.readCount || 0,
  readRate: computeRate(notification.meta?.readCount || 0, notification.meta?.recipientCount || 0),
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt,
});

const toSocketNotificationPayload = (notification, userNotification) => ({
  id: userNotification._id,
  notificationId: notification._id,
  title: notification.title,
  message: notification.message,
  channel: notification.channel,
  priority: notification.priority,
  status: notification.status,
  deliveryStatus: userNotification.deliveryStatus,
  targetType: notification.targetType,
  sentAt: userNotification.sentAt,
  readAt: userNotification.readAt,
  isRead: !!userNotification.readAt,
  createdAt: notification.createdAt,
});

const toUserNotificationView = (row) => {
  const notification = row.notification;
  return {
    id: row._id,
    notificationId: notification?._id || null,
    title: notification?.title || "",
    message: notification?.message || "",
    channel: notification?.channel || "announcement",
    priority: notification?.priority || "normal",
    status: notification?.status || "draft",
    deliveryStatus: row.deliveryStatus,
    targetType: notification?.targetType || null,
    sentAt: row.sentAt,
    readAt: row.readAt,
    isRead: !!row.readAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const emitNotificationUnreadCount = async (userId) => {
  const count = await UserNotification.countDocuments({
    user: userId,
    readAt: null,
    deliveryStatus: "sent",
  });
  emitToUser(userId, "notification:unread-count", { unreadCount: count });
  return count;
};

const emitAdminNotificationEvents = async (notification, action = "updated") => {
  const summary = toAdminNotificationSummary(notification);
  emitToAdmins(`admin:notification:${action}`, summary);
  const stats = await getAdminNotificationStats();
  emitToAdmins("admin:notification:stats", stats);
};

const syncNotificationMeta = async (notificationId) => {
  const [notification, aggregate] = await Promise.all([
    Notification.findById(notificationId),
    UserNotification.aggregate([
      { $match: { notification: new mongoose.Types.ObjectId(notificationId) } },
      {
        $group: {
          _id: null,
          recipientCount: { $sum: 1 },
          deliveredCount: {
            $sum: { $cond: [{ $eq: ["$deliveryStatus", "sent"] }, 1, 0] },
          },
          readCount: {
            $sum: { $cond: [{ $ifNull: ["$readAt", false] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  if (!notification) return null;

  const metrics = aggregate[0] || { recipientCount: 0, deliveredCount: 0, readCount: 0 };
  notification.meta = {
    recipientCount: metrics.recipientCount,
    deliveredCount: metrics.deliveredCount,
    readCount: metrics.readCount,
  };
  await notification.save();
  return notification;
};

const bulkCreateOrUpdateUserNotifications = async ({ notification, userIds, deliveryStatus, sentAt }) => {
  if (!userIds.length) return [];

  await UserNotification.bulkWrite(
    userIds.map((userId) => ({
      updateOne: {
        filter: { notification: notification._id, user: userId },
        update: {
          $setOnInsert: {
            notification: notification._id,
            user: userId,
          },
          $set: {
            deliveryStatus,
            sentAt: sentAt || null,
            failureReason: "",
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  return UserNotification.find({
    notification: notification._id,
    user: { $in: userIds },
  }).lean();
};

export const createNotificationCampaign = async ({ payload, actorId }) => {
  const createPayload = buildCreatePayload(payload, actorId);

  const notification = await Notification.create({
    ...createPayload,
    sentAt: null,
    meta: {
      recipientCount: 0,
      deliveredCount: 0,
      readCount: 0,
    },
  });

  const createdNotification = await Notification.findById(notification._id).lean();
  await emitAdminNotificationEvents(createdNotification, "created");

  if (notification.status === "sent") {
    return sendNotificationNow({ notificationId: notification._id, actorId, allowDraft: true });
  }

  return createdNotification;
};

export const sendNotificationNow = async ({ notificationId, actorId = null, allowDraft = false }) => {
  if (!isObjectId(notificationId)) throw new AppError("Invalid notification id", 400);

  const notification = await Notification.findById(notificationId);
  if (!notification) throw new AppError("Notification not found", 404);
  if (notification.status === "cancelled") {
    throw new AppError("Cancelled notifications cannot be sent", 400);
  }
  if (notification.status === "sent" && !allowDraft) {
    throw new AppError("Notification already sent", 400);
  }

  const recipientIds = await resolveTargetUsers({
    targetType: notification.targetType,
    target: {
      roles: notification.target?.roles || [],
      grades: notification.target?.grades || [],
      classes: notification.target?.classes || [],
      users: notification.target?.users || [],
    },
  });

  const sentAt = new Date();
  const userNotifications = await bulkCreateOrUpdateUserNotifications({
    notification,
    userIds: recipientIds,
    deliveryStatus: "sent",
    sentAt,
  });

  notification.status = "sent";
  notification.sentAt = sentAt;
  notification.scheduledFor = null;
  if (actorId) notification.updatedBy = actorId;
  await notification.save();
  const synced = await syncNotificationMeta(notification._id);

  const unreadCountsByUser = new Map();
  for (const row of userNotifications) {
    emitToUser(
      row.user,
      "notification:new",
      toSocketNotificationPayload(synced, row)
    );
    const unreadCount = await emitNotificationUnreadCount(row.user);
    unreadCountsByUser.set(String(row.user), unreadCount);
  }

  await emitAdminNotificationEvents(synced, "updated");
  return synced.toObject ? synced.toObject() : synced;
};

export const listAdminNotifications = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || 20), 100);
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.status && normalize(query.status).toLowerCase() !== "all") {
    filter.status = normalizeStatus(query.status);
  }
  if (query.channel && normalize(query.channel).toLowerCase() !== "all") {
    filter.channel = normalizeChannel(query.channel);
  }
  if (query.priority && normalize(query.priority).toLowerCase() !== "all") {
    filter.priority = normalizePriority(query.priority);
  }
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ title: regex }, { message: regex }];
  }

  const [total, rows] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    data: rows.map(toAdminNotificationSummary),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const getAdminNotificationStats = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [sentToday, scheduled, meta] = await Promise.all([
    Notification.countDocuments({ status: "sent", sentAt: { $gte: today, $lt: tomorrow } }),
    Notification.countDocuments({ status: "scheduled" }),
    Notification.aggregate([
      {
        $group: {
          _id: null,
          totalRecipients: { $sum: { $ifNull: ["$meta.recipientCount", 0] } },
          totalDelivered: { $sum: { $ifNull: ["$meta.deliveredCount", 0] } },
          totalRead: { $sum: { $ifNull: ["$meta.readCount", 0] } },
        },
      },
    ]),
  ]);

  const totals = meta[0] || { totalRecipients: 0, totalDelivered: 0, totalRead: 0 };

  return {
    sentToday,
    scheduled,
    totalRecipients: totals.totalRecipients,
    deliveredRate: computeRate(totals.totalDelivered, totals.totalRecipients),
    readRate: computeRate(totals.totalRead, totals.totalRecipients),
  };
};

export const getNotificationStatsById = async (notificationId) => {
  if (!isObjectId(notificationId)) throw new AppError("Invalid notification id", 400);
  const notification = await Notification.findById(notificationId).lean();
  if (!notification) throw new AppError("Notification not found", 404);

  return {
    notification: toAdminNotificationSummary(notification),
    metrics: {
      recipientCount: notification.meta?.recipientCount || 0,
      deliveredCount: notification.meta?.deliveredCount || 0,
      readCount: notification.meta?.readCount || 0,
      readRate: computeRate(notification.meta?.readCount || 0, notification.meta?.recipientCount || 0),
      deliveryRate: computeRate(notification.meta?.deliveredCount || 0, notification.meta?.recipientCount || 0),
    },
  };
};

export const cancelScheduledNotification = async ({ notificationId, actorId }) => {
  if (!isObjectId(notificationId)) throw new AppError("Invalid notification id", 400);
  const notification = await Notification.findById(notificationId);
  if (!notification) throw new AppError("Notification not found", 404);
  if (notification.status !== "scheduled") {
    throw new AppError("Only scheduled notifications can be cancelled", 400);
  }

  notification.status = "cancelled";
  notification.scheduledFor = null;
  notification.updatedBy = actorId || notification.updatedBy;
  await notification.save();

  await emitAdminNotificationEvents(notification.toObject ? notification.toObject() : notification, "updated");
  return notification;
};

export const rescheduleNotification = async ({ notificationId, scheduledFor, actorId }) => {
  if (!isObjectId(notificationId)) throw new AppError("Invalid notification id", 400);
  const notification = await Notification.findById(notificationId);
  if (!notification) throw new AppError("Notification not found", 404);
  if (notification.status === "sent") {
    throw new AppError("Sent notifications cannot be rescheduled", 400);
  }

  notification.scheduledFor = parseScheduledFor(scheduledFor, true);
  notification.status = "scheduled";
  notification.updatedBy = actorId || notification.updatedBy;
  await notification.save();

  await emitAdminNotificationEvents(notification.toObject ? notification.toObject() : notification, "updated");
  return notification;
};

export const updateNotificationCampaign = async ({ notificationId, payload, actorId }) => {
  if (!isObjectId(notificationId)) throw new AppError("Invalid notification id", 400);
  const notification = await Notification.findById(notificationId);
  if (!notification) throw new AppError("Notification not found", 404);

  if (payload.title !== undefined) {
    const title = normalize(payload.title);
    if (!title) throw new AppError("title cannot be empty", 400);
    notification.title = title;
  }
  if (payload.message !== undefined) {
    const message = normalize(payload.message);
    if (!message) throw new AppError("message cannot be empty", 400);
    notification.message = message;
  }
  if (payload.channel !== undefined) notification.channel = normalizeChannel(payload.channel);
  if (payload.priority !== undefined) notification.priority = normalizePriority(payload.priority);
  if (payload.targetType !== undefined || payload.target !== undefined) {
    const targetType = normalizeTargetType(payload.targetType || notification.targetType);
    notification.targetType = targetType;
    notification.target = normalizeTarget(targetType, {
      roles: payload?.target?.roles ?? payload.roles ?? notification.target?.roles,
      grades: payload?.target?.grades ?? payload.grades ?? notification.target?.grades,
      classes: payload?.target?.classes ?? payload.classes ?? notification.target?.classes,
      users: payload?.target?.users ?? payload.users ?? notification.target?.users,
    });
  }
  if (payload.status !== undefined) notification.status = normalizeStatus(payload.status, notification.status);
  if (payload.scheduledFor !== undefined) {
    notification.scheduledFor = parseScheduledFor(payload.scheduledFor, false);
  }
  notification.updatedBy = actorId || notification.updatedBy;
  await notification.save();

  if (notification.status === "sent") {
    return sendNotificationNow({ notificationId: notification._id, actorId, allowDraft: true });
  }

  await emitAdminNotificationEvents(notification.toObject ? notification.toObject() : notification, "updated");
  return notification;
};

export const listCurrentUserNotifications = async (userId, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || 20), 100);
  const skip = (page - 1) * limit;

  const filter = { user: userId };
  if (query.read === "true") filter.readAt = { $ne: null };
  if (query.read === "false") filter.readAt = null;

  const [total, rows] = await Promise.all([
    UserNotification.countDocuments(filter),
    UserNotification.find(filter)
      .populate({
        path: "notification",
        select: "title message channel priority status targetType sentAt createdAt",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    data: rows.filter((row) => row.notification).map(toUserNotificationView),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const markUserNotificationRead = async ({ userId, userNotificationId }) => {
  if (!isObjectId(userNotificationId)) throw new AppError("Invalid notification id", 400);

  let userNotification = await UserNotification.findOne({
    _id: userNotificationId,
    user: userId,
  });
  if (!userNotification) {
    userNotification = await UserNotification.findOne({
      notification: userNotificationId,
      user: userId,
    });
  }
  if (!userNotification) throw new AppError("User notification not found", 404);

  if (!userNotification.readAt) {
    userNotification.readAt = new Date();
    await userNotification.save();
    await syncNotificationMeta(userNotification.notification);
  }

  const populated = await UserNotification.findById(userNotification._id)
    .populate({
      path: "notification",
      select: "title message channel priority status targetType sentAt createdAt",
    })
    .lean();

  emitToUser(userId, "notification:read", {
    id: populated._id,
    notificationId: populated.notification?._id || null,
    readAt: populated.readAt,
    isRead: true,
  });
  await emitNotificationUnreadCount(userId);

  const notification = await Notification.findById(userNotification.notification).lean();
  if (notification) {
    await emitAdminNotificationEvents(notification, "updated");
  }

  return toUserNotificationView(populated);
};

export const getCurrentUserUnreadCount = async (userId) => {
  const unreadCount = await UserNotification.countDocuments({
    user: userId,
    readAt: null,
    deliveryStatus: "sent",
  });
  return { unreadCount };
};

export const processDueScheduledNotifications = async () => {
  const now = new Date();
  const notifications = await Notification.find({
    status: "scheduled",
    scheduledFor: { $ne: null, $lte: now },
  })
    .select("_id")
    .lean();

  for (const row of notifications) {
    try {
      await sendNotificationNow({ notificationId: row._id, allowDraft: true });
    } catch (error) {
      console.error("notificationScheduleSendError", row._id, error);
    }
  }
};

let notificationScheduleCronTask = null;

export const startNotificationScheduleCron = () => {
  if (notificationScheduleCronTask) return;
  notificationScheduleCronTask = cron.schedule("*/1 * * * *", () => {
    processDueScheduledNotifications().catch((error) => {
      console.error("notificationScheduleCronError", error);
    });
  });
};

export const stopNotificationScheduleCron = () => {
  if (notificationScheduleCronTask) {
    notificationScheduleCronTask.stop();
    notificationScheduleCronTask = null;
  }
};
