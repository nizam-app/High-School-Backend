import crypto from "crypto";
import bcrypt from "bcryptjs";
import env from "../config/env.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateCode = () => {
  const bytes = crypto.randomBytes(8);
  let output = "";
  for (let i = 0; i < bytes.length; i += 1) {
    output += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${output.slice(0, 4)}-${output.slice(4, 8)}`;
};

export const generateBackupCodes = async () => {
  const count = Math.max(4, Number(env.TWO_FACTOR_BACKUP_CODES_COUNT) || 8);
  const plainCodes = Array.from({ length: count }, () => generateCode());
  const hashedCodes = await Promise.all(plainCodes.map((code) => bcrypt.hash(code, 10)));

  return {
    plainCodes,
    hashedCodes,
  };
};
