
import dotenv from "dotenv";
dotenv.config();

// required(key): env না থাকলে error throw করবে
const required = (key) => {
  if (!process.env[key]) throw new Error(`Missing env: ${key}`);
  return process.env[key];
};

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
};

const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase();
const isProduction = nodeEnv === "production";
const includeTestByEnv = nodeEnv === "staging" || nodeEnv === "uat";

const parseTrustProxy = () => {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === null || raw === "") return false;
  const s = String(raw).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return 1;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return false;
};

const jwtSecret = required("JWT_SECRET");
if (isProduction && jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must be at least 32 characters in production (use a strong random string)."
  );
}

const corsOrigin = process.env.CORS_ORIGIN || "*";
if (isProduction && corsOrigin.trim() === "*") {
  console.warn(
    "[env] CORS_ORIGIN is \"*\" in production. Set explicit origins (comma-separated) if clients use credentials."
  );
}

const env = {
  NODE_ENV: nodeEnv,
  isProduction,
  PORT: Number(process.env.PORT) || 5000,
  MONGODB_URL: required("MONGODB_URL"),
  JWT_SECRET: jwtSecret,
  JWT_ACCESS_EXPIRES_IN: required("JWT_ACCESS_EXPIRES_IN"),
  APP_NAME: process.env.APP_NAME || "Online High School",
  HOST: process.env.HOST || "0.0.0.0",
  CORS_ORIGIN: corsOrigin,
  TRUST_PROXY: parseTrustProxy(),
  JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT || "1mb",
  API_RATE_LIMIT_WINDOW_MS: Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  API_RATE_LIMIT_MAX: Number(process.env.API_RATE_LIMIT_MAX) || (isProduction ? 2000 : 10000),
  REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  OTP_TTL_SECONDS: Number(process.env.OTP_TTL_SECONDS) || 300,
  OTP_MAX_VERIFY_ATTEMPTS: Number(process.env.OTP_MAX_VERIFY_ATTEMPTS) || 5,
  OTP_MAX_RESEND: Number(process.env.OTP_MAX_RESEND) || 3,
  OTP_RESEND_COOLDOWN_SECONDS: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60,
  OTP_LENGTH: Number(process.env.OTP_LENGTH) || 4,
  SMS_BASE_URL: process.env.SMS_BASE_URL || "http://sms.moon.mr:8008",
  SMS_SEND_PATH: process.env.SMS_SEND_PATH || "/api/sendsms",
  SMS_STATISTICS_PATH: process.env.SMS_STATISTICS_PATH || "/api/sms-statistics",
  SMS_AUTH_TOKEN: process.env.SMS_AUTH_TOKEN || "",
  SMS_INCLUDE_TEST_WORD: toBool(process.env.SMS_INCLUDE_TEST_WORD, includeTestByEnv),
  TWO_FACTOR_ISSUER: process.env.TWO_FACTOR_ISSUER || process.env.APP_NAME || "Online High School",
  TWO_FACTOR_TEMP_TOKEN_SECRET:
    process.env.TWO_FACTOR_TEMP_TOKEN_SECRET || process.env.JWT_SECRET,
  TWO_FACTOR_TEMP_TOKEN_EXPIRES_IN:
    process.env.TWO_FACTOR_TEMP_TOKEN_EXPIRES_IN || "5m",
  TWO_FACTOR_ENCRYPTION_KEY:
    process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_SECRET,
  TWO_FACTOR_BACKUP_CODES_COUNT:
    Number(process.env.TWO_FACTOR_BACKUP_CODES_COUNT) || 8,
  TWO_FACTOR_MAX_FAILURES: Number(process.env.TWO_FACTOR_MAX_FAILURES) || 5,
  TWO_FACTOR_LOCK_MINUTES: Number(process.env.TWO_FACTOR_LOCK_MINUTES) || 10,
};

export default env;
export { env };
