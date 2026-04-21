import bcrypt from "bcryptjs";
import AppError from "../../utils/AppError.js";
import env from "../../config/env.js";
import User from "../user/user.model.js";
import { createAuditLog } from "../../utils/auditLog.js";
import { decryptSecret, encryptSecret } from "../../utils/encryptSecret.js";
import { generateBackupCodes } from "../../utils/generateBackupCodes.js";
import { verifyTwoFactorTempToken } from "../../utils/twoFactorTokens.js";
import {
  isPrivilegedRole,
  signAccessToken,
  toRoleScopedAuthUser,
} from "../auth/auth.service.js";

const USER_2FA_SELECT = [
  "name",
  "role",
  "phone",
  "email",
  "status",
  "phoneVerified",
  "createdVia",
  "gradeId",
  "gradeLevel",
  "assignedSubjectIds",
  "assignedSubjects",
  "subjectId",
  "subject",
  "assignedGradeIds",
  "assignedGrades",
  "twoFactorEnabled",
  "+twoFactorSecret",
  "+twoFactorTempSecret",
  "+twoFactorBackupCodes",
  "twoFactorEnabledAt",
  "+twoFactorFailedAttempts",
  "+twoFactorLockedUntil",
].join(" ");

const loadSpeakeasy = async () => {
  const mod = await import("speakeasy");
  return mod.default || mod;
};

const loadQRCode = async () => {
  try {
    const mod = await import("qrcode");
    return mod.default || mod;
  } catch {
    return null;
  }
};

const normalizeOtp = (otp) => String(otp || "").trim();
const normalizeBackupCode = (backupCode) => {
  const raw = String(backupCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length === 8) return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  return raw;
};

const getUserLabel = (user) => user.email || user.phone || user.name || user._id.toString();

const assertPrivilegedUser = (user) => {
  if (!user) throw new AppError("User not found", 404);
  if (!isPrivilegedRole(user.role)) {
    throw new AppError("This route is only available to admin users", 403);
  }
};

const validateOtpInput = (otp) => {
  const normalized = normalizeOtp(otp);
  if (!normalized) throw new AppError("Authentication code is required", 400);
  if (!/^\d{6}$/.test(normalized)) {
    throw new AppError("Authentication code must be exactly 6 digits", 400);
  }
  return normalized;
};

const ensureTwoFactorFactorInput = ({ otp, backupCode }) => {
  if (!normalizeOtp(otp) && !normalizeBackupCode(backupCode)) {
    throw new AppError("Either otp or backupCode is required", 400);
  }
};

const assertNotLocked = (user) => {
  const lockedUntil = user?.twoFactorLockedUntil ? new Date(user.twoFactorLockedUntil) : null;
  if (lockedUntil && lockedUntil > new Date()) {
    throw new AppError(
      `Too many invalid two-factor attempts. Try again after ${lockedUntil.toISOString()}`,
      429
    );
  }
};

const resetFailures = (user) => {
  user.twoFactorFailedAttempts = 0;
  user.twoFactorLockedUntil = null;
};

const recordFailure = async (user) => {
  const failures = Number(user.twoFactorFailedAttempts || 0) + 1;
  user.twoFactorFailedAttempts = failures;
  if (failures >= env.TWO_FACTOR_MAX_FAILURES) {
    const lockedUntil = new Date();
    lockedUntil.setMinutes(lockedUntil.getMinutes() + env.TWO_FACTOR_LOCK_MINUTES);
    user.twoFactorLockedUntil = lockedUntil;
  }
  await user.save();
};

const verifyCurrentCredential = async (user, payload = {}) => {
  const currentPassword = String(
    payload.currentPassword ?? payload.currentPin ?? payload.password ?? payload.pin ?? ""
  ).trim();
  if (!currentPassword) {
    throw new AppError("Current password or PIN is required", 400);
  }

  const userWithCredential = await User.findById(user._id).select("+pin");
  if (!userWithCredential) {
    throw new AppError("User not found", 404);
  }

  if (typeof userWithCredential.comparePassword === "function") {
    return userWithCredential.comparePassword(currentPassword);
  }
  if (typeof userWithCredential.comparePin === "function") {
    return userWithCredential.comparePin(currentPassword);
  }

  throw new AppError("Current credential verification is not supported on this account", 400);
};

const verifyBackupCode = async (user, inputCode) => {
  const backupCode = normalizeBackupCode(inputCode);
  if (!backupCode) return { valid: false, remainingCodes: user.twoFactorBackupCodes || [] };

  const hashes = Array.isArray(user.twoFactorBackupCodes) ? user.twoFactorBackupCodes : [];
  for (let index = 0; index < hashes.length; index += 1) {
    const isMatch = await bcrypt.compare(backupCode, hashes[index]);
    if (isMatch) {
      return {
        valid: true,
        remainingCodes: hashes.filter((_, currentIndex) => currentIndex !== index),
      };
    }
  }

  return { valid: false, remainingCodes: hashes };
};

const verifyAuthenticatorCode = async (encryptedSecret, otp) => {
  const token = validateOtpInput(otp);
  const secret = decryptSecret(encryptedSecret);
  const speakeasy = await loadSpeakeasy();

  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 1,
  });
};

const verifyTwoFactorFactor = async ({ user, otp, backupCode }) => {
  ensureTwoFactorFactorInput({ otp, backupCode });

  if (normalizeOtp(otp)) {
    if (!user.twoFactorSecret) throw new AppError("Two-factor secret is not configured", 400);
    const otpValid = await verifyAuthenticatorCode(user.twoFactorSecret, otp);
    return {
      valid: otpValid,
      method: "otp",
      remainingBackupCodes: user.twoFactorBackupCodes || [],
    };
  }

  const backupResult = await verifyBackupCode(user, backupCode);
  return {
    valid: backupResult.valid,
    method: "backup_code",
    remainingBackupCodes: backupResult.remainingCodes,
  };
};

const logTwoFactorEvent = async ({
  user,
  action,
  summary,
  metadata = {},
  context = {},
}) =>
  createAuditLog({
    actorId: user?._id || null,
    actorRole: user?.role || "admin",
    action,
    entityType: "user",
    entityId: user?._id || "unknown",
    summary,
    metadata,
    ip: context.ip,
    userAgent: context.userAgent,
  });

const getTwoFactorUser = async (userId) => {
  const user = await User.findById(userId).select(USER_2FA_SELECT);
  assertPrivilegedUser(user);
  return user;
};

export const setupTwoFactor = async ({ userId, context = {} }) => {
  const user = await getTwoFactorUser(userId);

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    throw new AppError("Two-factor authentication is already enabled", 409);
  }

  const speakeasy = await loadSpeakeasy();
  const secret = speakeasy.generateSecret({
    issuer: env.TWO_FACTOR_ISSUER,
    name: getUserLabel(user),
    length: 32,
  });

  user.twoFactorTempSecret = encryptSecret(secret.base32);
  await user.save();

  let qrCodeDataUrl = null;
  const QRCode = await loadQRCode();
  if (QRCode && secret.otpauth_url) {
    qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);
  }

  await logTwoFactorEvent({
    user,
    action: "admin.2fa.setup_started",
    summary: "Started two-factor authentication setup",
    context,
  });

  return {
    manualEntryKey: secret.base32,
    otpauthUrl: secret.otpauth_url,
    qrCodeDataUrl,
  };
};

export const verifyAndEnableTwoFactor = async ({ userId, otp, context = {} }) => {
  const user = await getTwoFactorUser(userId);
  assertNotLocked(user);

  if (!user.twoFactorTempSecret) {
    throw new AppError("No two-factor setup is pending for this account", 400);
  }

  const isValid = await verifyAuthenticatorCode(user.twoFactorTempSecret, otp);
  if (!isValid) {
    await recordFailure(user);
    await logTwoFactorEvent({
      user,
      action: "admin.2fa.verify_failed",
      summary: "Failed to verify two-factor setup code",
      context,
    });
    throw new AppError("Invalid authentication code", 401);
  }

  const decryptedTempSecret = decryptSecret(user.twoFactorTempSecret);
  const { plainCodes, hashedCodes } = await generateBackupCodes();

  user.twoFactorSecret = encryptSecret(decryptedTempSecret);
  user.twoFactorTempSecret = null;
  user.twoFactorEnabled = true;
  user.twoFactorEnabledAt = new Date();
  user.twoFactorBackupCodes = hashedCodes;
  resetFailures(user);
  await user.save();

  await logTwoFactorEvent({
    user,
    action: "admin.2fa.enabled",
    summary: "Enabled two-factor authentication",
    metadata: { backupCodesCount: plainCodes.length },
    context,
  });

  return {
    backupCodes: plainCodes,
    enabledAt: user.twoFactorEnabledAt,
  };
};

export const verifyTwoFactorLogin = async ({
  tempAuthToken,
  otp,
  backupCode,
  context = {},
}) => {
  if (!String(tempAuthToken || "").trim()) {
    throw new AppError("tempAuthToken is required", 400);
  }

  const payload = verifyTwoFactorTempToken(tempAuthToken);
  const user = await getTwoFactorUser(payload.sub);
  assertNotLocked(user);

  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new AppError("Two-factor authentication is not enabled for this account", 400);
  }
  if (user.status === "blocked") {
    throw new AppError("Account is blocked", 403);
  }

  const factorResult = await verifyTwoFactorFactor({ user, otp, backupCode });
  if (!factorResult.valid) {
    await recordFailure(user);
    await logTwoFactorEvent({
      user,
      action: "admin.2fa.login_failed",
      summary: "Failed two-factor login attempt",
      metadata: { method: factorResult.method },
      context,
    });
    throw new AppError("Invalid authentication code", 401);
  }

  if (factorResult.method === "backup_code") {
    user.twoFactorBackupCodes = factorResult.remainingBackupCodes;
  }
  resetFailures(user);
  await user.save();

  return {
    requiresTwoFactor: false,
    token: signAccessToken(user),
    user: toRoleScopedAuthUser(user),
  };
};

export const disableTwoFactor = async ({
  userId,
  currentPassword,
  currentPin,
  otp,
  backupCode,
  context = {},
}) => {
  const user = await getTwoFactorUser(userId);

  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new AppError("Two-factor authentication is not enabled", 400);
  }

  const credentialOk = await verifyCurrentCredential(user, { currentPassword, currentPin });
  if (!credentialOk) {
    await logTwoFactorEvent({
      user,
      action: "admin.2fa.disable_failed",
      summary: "Failed two-factor disable attempt due to invalid current credential",
      context,
    });
    throw new AppError("Invalid current password or PIN", 401);
  }

  assertNotLocked(user);
  const factorResult = await verifyTwoFactorFactor({ user, otp, backupCode });
  if (!factorResult.valid) {
    await recordFailure(user);
    await logTwoFactorEvent({
      user,
      action: "admin.2fa.disable_failed",
      summary: "Failed two-factor disable attempt due to invalid authentication code",
      metadata: { method: factorResult.method },
      context,
    });
    throw new AppError("Invalid authentication code", 401);
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecret = null;
  user.twoFactorTempSecret = null;
  user.twoFactorBackupCodes = [];
  user.twoFactorEnabledAt = null;
  resetFailures(user);
  await user.save();

  await logTwoFactorEvent({
    user,
    action: "admin.2fa.disabled",
    summary: "Disabled two-factor authentication",
    metadata: { method: factorResult.method },
    context,
  });

  return { disabled: true };
};

export const regenerateTwoFactorBackupCodes = async ({
  userId,
  currentPassword,
  currentPin,
  otp,
  backupCode,
  context = {},
}) => {
  const user = await getTwoFactorUser(userId);

  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new AppError("Two-factor authentication is not enabled", 400);
  }

  const hasCredential = Boolean(
    String(currentPassword ?? currentPin ?? "").trim()
  );
  const hasFactor = Boolean(normalizeOtp(otp) || normalizeBackupCode(backupCode));
  if (!hasCredential && !hasFactor) {
    throw new AppError("Provide current password/PIN or a valid OTP/backup code", 400);
  }

  if (hasCredential) {
    const credentialOk = await verifyCurrentCredential(user, { currentPassword, currentPin });
    if (!credentialOk) {
      await logTwoFactorEvent({
        user,
        action: "admin.2fa.backup_codes_regenerate_failed",
        summary: "Failed backup-code regeneration due to invalid current credential",
        context,
      });
      throw new AppError("Invalid current password or PIN", 401);
    }
  } else {
    assertNotLocked(user);
    const factorResult = await verifyTwoFactorFactor({ user, otp, backupCode });
    if (!factorResult.valid) {
      await recordFailure(user);
      await logTwoFactorEvent({
        user,
        action: "admin.2fa.backup_codes_regenerate_failed",
        summary: "Failed backup-code regeneration due to invalid authentication code",
        metadata: { method: factorResult.method },
        context,
      });
      throw new AppError("Invalid authentication code", 401);
    }
    if (factorResult.method === "backup_code") {
      user.twoFactorBackupCodes = factorResult.remainingBackupCodes;
    }
  }

  const { plainCodes, hashedCodes } = await generateBackupCodes();
  user.twoFactorBackupCodes = hashedCodes;
  resetFailures(user);
  await user.save();

  await logTwoFactorEvent({
    user,
    action: "admin.2fa.backup_codes_regenerated",
    summary: "Regenerated two-factor backup codes",
    metadata: { backupCodesCount: plainCodes.length },
    context,
  });

  return { backupCodes: plainCodes };
};
