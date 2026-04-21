import { ActivityLog } from "../modules/activity/activityLog.model.js";

const normalizeRole = (role) => String(role || "system").trim().toLowerCase();
const allowedRoles = new Set(["student", "teacher", "admin", "system"]);

export const createAuditLog = async ({
  actorId = null,
  actorRole = "system",
  action,
  entityType,
  entityId,
  summary = "",
  metadata = {},
  ip = "",
  userAgent = "",
}) => {
  if (!action || !entityType || !entityId) return null;

  return ActivityLog.create({
    actor: actorId,
    actorRole: allowedRoles.has(normalizeRole(actorRole)) ? normalizeRole(actorRole) : "admin",
    action,
    entityType,
    entityId: String(entityId),
    summary,
    metadata,
    ip: String(ip || "").trim(),
    userAgent: String(userAgent || "").trim(),
  });
};
