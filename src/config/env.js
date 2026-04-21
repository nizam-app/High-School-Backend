
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
const includeTestByEnv = nodeEnv === "staging" || nodeEnv === "uat";

const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT) || 5000,
  MONGODB_URL: required("MONGODB_URL"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_ACCESS_EXPIRES_IN: required("JWT_ACCESS_EXPIRES_IN"),
  APP_NAME: process.env.APP_NAME || "Online High School",
  HOST: process.env.HOST || "0.0.0.0",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
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
