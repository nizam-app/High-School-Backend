
import jwt from "jsonwebtoken";
import env from "../config/env.js";
import AppError from "../utils/AppError.js";
import User from "../modules/user/user.model.js"; 

const normalizeRole = (role) => String(role || "").trim().toLowerCase();
const roleAliases = {
  admin: ["admin", "super_admin", "superadmin"],
};

const matchesRole = (userRole, allowedRole) => {
  const normalizedUserRole = normalizeRole(userRole);
  const normalizedAllowedRole = normalizeRole(allowedRole);
  const acceptedRoles = roleAliases[normalizedAllowedRole] || [normalizedAllowedRole];
  return acceptedRoles.includes(normalizedUserRole);
};

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return next(new AppError("Unauthorized: token missing", 401));
    const token = header.split(" ")[1];
    const payload = jwt.verify(token, env.JWT_SECRET);
    const userId = payload.sub || payload.userId;
    if (!userId) return next(new AppError("Unauthorized: invalid token payload", 401));

    const user = await User.findById(userId);
    if (!user) return next(new AppError("Unauthorized: user not found", 401));
    if (user.status === "blocked") return next(new AppError("Account disabled", 403));
    req.user = user; 
    next();
  } catch (e) {
    return next(new AppError("Unauthorized: invalid token", 401));
  }
};
export const restrictTo = (...roles) => (req, res, next) => {
  if (!req.user?.role) return next(new AppError("Unauthorized", 401));
  if (!roles.some((role) => matchesRole(req.user.role, role))) {
    return next(new AppError("Forbidden", 403));
  }
  next();
};
