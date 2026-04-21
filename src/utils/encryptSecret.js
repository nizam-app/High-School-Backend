import crypto from "crypto";
import env from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const getKey = () =>
  crypto
    .createHash("sha256")
    .update(String(env.TWO_FACTOR_ENCRYPTION_KEY || env.JWT_SECRET || "fallback"))
    .digest();

export const encryptSecret = (value) => {
  const plainText = String(value || "").trim();
  if (!plainText) return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
};

export const decryptSecret = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const [ivRaw, tagRaw, encryptedRaw] = raw.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted secret format");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivRaw, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};
