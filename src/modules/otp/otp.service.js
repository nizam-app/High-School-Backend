import bcrypt from "bcryptjs";
import env from "../../config/env.js";
import { redisClient } from "../../config/redis.js";
import { smsClient } from "../../config/smsClient.js";
import AppError from "../../utils/AppError.js";
import { User } from "../user/user.model.js";

const resendKey = (phone) => `otp:resend:${phone}`;
const cooldownKey = (phone) => `otp:cooldown:${phone}`;
const signupStateKey = (phone) => `otp:signup:${phone}`;

const generateNumericOtp = (length = 4) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
};

const buildOtpMessage = (otp) => {
  if (env.SMS_INCLUDE_TEST_WORD) {
    return `Your test verification code is ${otp}`;
  }
  return `Your verification code is ${otp}`;
};

const sendSmsOtp = async ({ phone, otp }) => {
  try {
    await smsClient.post(env.SMS_SEND_PATH, {
      phone,
      message: buildOtpMessage(otp),
    });
  } catch (err) {
    // Log Moon API response for debugging auth/errors
    if (err?.response) {
      console.error("[SMS/Moon] status:", err.response.status, "data:", err.response.data);
    }
    const providerMessage =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "SMS provider request failed";
    throw new AppError(providerMessage, 502);
  }
};

const ensureProviderConfigured = () => {
  if (!env.SMS_AUTH_TOKEN) {
    throw new AppError("SMS provider is not configured. Set SMS_AUTH_TOKEN", 500);
  }
};

const ensureRedisReady = () => {
  if (!redisClient?.isReady) {
    throw new AppError("OTP service unavailable. Redis is not connected", 503);
  }
};

const loadSignupState = async (phone) => {
  ensureRedisReady();
  const raw = await redisClient.get(signupStateKey(phone));
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    await redisClient.del(signupStateKey(phone));
    return null;
  }
};

const saveSignupState = async (phone, state, ttlSeconds = env.OTP_TTL_SECONDS) => {
  ensureRedisReady();
  await redisClient.set(signupStateKey(phone), JSON.stringify(state), { EX: ttlSeconds });
};

const clearSignupOtpState = async (phone) => {
  if (!redisClient?.isReady) return;
  await Promise.all([
    redisClient.del(signupStateKey(phone)),
    redisClient.del(resendKey(phone)),
    redisClient.del(cooldownKey(phone)),
  ]);
};

const verifySignupOtpState = async ({ phone, otp }) => {
  const state = await loadSignupState(phone);
  const now = Date.now();
  const expiresAt = Number(state?.expiresAt || 0);
  const ttl = expiresAt > now ? Math.ceil((expiresAt - now) / 1000) : 0;

  if (!state?.otpHash || ttl <= 0) {
    await clearSignupOtpState(phone);
    throw new AppError("OTP expired or not found. Please request a new OTP", 400);
  }

  const attempts = Number(state.attempts || 0) + 1;
  if (attempts > env.OTP_MAX_VERIFY_ATTEMPTS) {
    await clearSignupOtpState(phone);
    throw new AppError("Too many attempts. OTP invalidated", 429);
  }

  const isMatch = await bcrypt.compare(otp, state.otpHash);
  if (!isMatch) {
    await saveSignupState(phone, { ...state, attempts }, ttl);
    throw new AppError(
      `Invalid OTP. Remaining attempts: ${Math.max(env.OTP_MAX_VERIFY_ATTEMPTS - attempts, 0)}`,
      400
    );
  }

  await saveSignupState(
    phone,
    {
      ...state,
      attempts: 0,
      otpHash: null,
      verified: true,
      verifiedAt: now,
    },
    ttl
  );

  await Promise.all([
    redisClient.del(resendKey(phone)),
    redisClient.del(cooldownKey(phone)),
  ]);

  return {
    verified: true,
    phone,
    phoneVerified: true,
  };
};

export const assertSignupPhoneVerified = async (phone) => {
  const state = await loadSignupState(phone);
  const now = Date.now();
  const expiresAt = Number(state?.expiresAt || 0);

  if (!state?.verified || expiresAt <= now) {
    if (state && expiresAt <= now) {
      await clearSignupOtpState(phone);
    }
    throw new AppError("Phone number is not OTP verified", 400);
  }

  return true;
};

export const consumeSignupPhoneVerification = async (phone) => {
  await clearSignupOtpState(phone);
};

export const sendOtpService = async ({ phone }) => {
  ensureProviderConfigured();
  const user = await User.findOne({ phone });

  if (!user) {
    ensureRedisReady();

    const otp = generateNumericOtp(env.OTP_LENGTH);
    const otpHash = await bcrypt.hash(otp, 10);

    await sendSmsOtp({ phone, otp });

    await saveSignupState(phone, {
      otpHash,
      expiresAt: Date.now() + env.OTP_TTL_SECONDS * 1000,
      attempts: 0,
      verified: false,
      verifiedAt: null,
    });

    await Promise.all([
      redisClient.set(resendKey(phone), "0", { EX: env.OTP_TTL_SECONDS }),
      redisClient.del(cooldownKey(phone)),
    ]);

    return {
      phone,
      expiresInSeconds: env.OTP_TTL_SECONDS,
      maxVerifyAttempts: env.OTP_MAX_VERIFY_ATTEMPTS,
    };
  }

  const otp = generateNumericOtp(env.OTP_LENGTH);
  const otpHash = await bcrypt.hash(otp, 10);

  await sendSmsOtp({ phone, otp });

  user.otpHash = otpHash;
  user.expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);
  user.attempts = 0;
  await user.save();

  // Optional cooldown/resend cache reset (best-effort)
  if (redisClient?.isReady) {
    await Promise.all([
      redisClient.set(resendKey(phone), "0", { EX: env.OTP_TTL_SECONDS }),
      redisClient.del(cooldownKey(phone)),
    ]);
  }

  return {
    phone,
    expiresInSeconds: env.OTP_TTL_SECONDS,
    maxVerifyAttempts: env.OTP_MAX_VERIFY_ATTEMPTS,
  };
};

export const verifyOtpService = async ({ phone, otp }) => {
  const user = await User.findOne({ phone }).select("+otpHash +expiresAt +attempts phone phoneVerified");
  if (!user) {
    return verifySignupOtpState({ phone, otp });
  }

  const now = new Date();
  const ttl =
    user.expiresAt && user.expiresAt.getTime() > now.getTime()
      ? Math.ceil((user.expiresAt.getTime() - now.getTime()) / 1000)
      : 0;

  if (!user.otpHash || !user.expiresAt || ttl <= 0) {
    user.otpHash = null;
    user.expiresAt = null;
    user.attempts = 0;
    await user.save();
    throw new AppError("OTP expired or not found. Please request a new OTP", 400);
  }

  const attempts = Number(user.attempts || 0) + 1;
  user.attempts = attempts;

  if (attempts > env.OTP_MAX_VERIFY_ATTEMPTS) {
    user.otpHash = null;
    user.expiresAt = null;
    user.attempts = 0;
    await user.save();
    if (redisClient?.isReady) {
      await Promise.all([
        redisClient.del(resendKey(phone)),
        redisClient.del(cooldownKey(phone)),
      ]);
    }
    throw new AppError("Too many attempts. OTP invalidated", 429);
  }

  const isMatch = await bcrypt.compare(otp, user.otpHash);
  if (!isMatch) {
    await user.save();
    throw new AppError(
      `Invalid OTP. Remaining attempts: ${Math.max(env.OTP_MAX_VERIFY_ATTEMPTS - attempts, 0)}`,
      400
    );
  }

  user.phoneVerified = true;
  user.otpHash = null;
  user.expiresAt = null;
  user.attempts = 0;
  await user.save();

  if (redisClient?.isReady) {
    await Promise.all([
      redisClient.del(resendKey(phone)),
      redisClient.del(cooldownKey(phone)),
    ]);
  }

  return {
    verified: true,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
  };
};

export const resendOtpService = async ({ phone }) => {
  ensureProviderConfigured();
  ensureRedisReady();

  const user = await User.findOne({ phone }).select("+otpHash +expiresAt +attempts");

  if (!user) {
    const state = await loadSignupState(phone);
    const now = Date.now();
    const expiresAt = Number(state?.expiresAt || 0);
    const ttl = expiresAt > now ? Math.ceil((expiresAt - now) / 1000) : 0;

    const cooldownRemaining = await redisClient.ttl(cooldownKey(phone));

    if (!state?.otpHash || ttl <= 0) {
      await clearSignupOtpState(phone);
      throw new AppError("OTP expired. Please use /otp/send", 400);
    }

    if (cooldownRemaining > 0) {
      throw new AppError(`Please wait ${cooldownRemaining}s before resending`, 429);
    }

    const resendCount = await redisClient.incr(resendKey(phone));
    if (resendCount === 1) {
      await redisClient.expire(resendKey(phone), ttl);
    }
    if (resendCount > env.OTP_MAX_RESEND) {
      throw new AppError("Resend limit reached for this OTP session", 429);
    }

    const nextOtp = generateNumericOtp(env.OTP_LENGTH);
    const nextOtpHash = await bcrypt.hash(nextOtp, 10);

    await sendSmsOtp({ phone, otp: nextOtp });

    await saveSignupState(
      phone,
      {
        ...state,
        otpHash: nextOtpHash,
        attempts: 0,
        verified: false,
        verifiedAt: null,
      },
      ttl
    );

    await Promise.all([
      redisClient.expire(resendKey(phone), ttl),
      redisClient.set(cooldownKey(phone), "1", { EX: env.OTP_RESEND_COOLDOWN_SECONDS }),
    ]);

    return {
      phone,
      resendCount,
      expiresInSeconds: ttl,
      cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  const now = new Date();
  const ttl =
    user.expiresAt && user.expiresAt.getTime() > now.getTime()
      ? Math.ceil((user.expiresAt.getTime() - now.getTime()) / 1000)
      : 0;

  const cooldownRemaining = await redisClient.ttl(cooldownKey(phone));

  if (!user.otpHash || !user.expiresAt || ttl <= 0) {
    throw new AppError("OTP expired. Please use /otp/send", 400);
  }

  if (cooldownRemaining > 0) {
    throw new AppError(`Please wait ${cooldownRemaining}s before resending`, 429);
  }

  const resendCount = await redisClient.incr(resendKey(phone));
  if (resendCount === 1) {
    await redisClient.expire(resendKey(phone), ttl);
  }
  if (resendCount > env.OTP_MAX_RESEND) {
    throw new AppError("Resend limit reached for this OTP session", 429);
  }

  const otp = generateNumericOtp(env.OTP_LENGTH);
  const otpHashNext = await bcrypt.hash(otp, 10);

  await sendSmsOtp({ phone, otp });

  user.otpHash = otpHashNext;
  user.attempts = 0;
  await user.save();

  await Promise.all([
    redisClient.expire(resendKey(phone), ttl),
    redisClient.set(cooldownKey(phone), "1", { EX: env.OTP_RESEND_COOLDOWN_SECONDS }),
  ]);

  return {
    phone,
    resendCount,
    expiresInSeconds: ttl,
    cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
  };
};

export const getSmsStatisticsService = async () => {
  ensureProviderConfigured();
  try {
    const { data } = await smsClient.get(env.SMS_STATISTICS_PATH);
    return data;
  } catch (err) {
    const providerMessage =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to fetch SMS statistics";
    throw new AppError(providerMessage, 502);
  }
};
