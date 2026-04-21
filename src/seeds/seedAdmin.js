import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../modules/user/user.model.js";

dotenv.config();

const normalizeStr = (v) => String(v || "").trim();

const ADMIN_NAME = normalizeStr(process.env.ADMIN_NAME || "System Admin");
const ADMIN_PHONE = normalizeStr(process.env.ADMIN_PHONE);
const ADMIN_PIN = normalizeStr(process.env.ADMIN_PIN || "1234");

const validateInput = () => {
  if (!process.env.MONGODB_URL) {
    throw new Error("Missing env: MONGODB_URL");
  }

  if (!ADMIN_PHONE) {
    throw new Error("Missing env: ADMIN_PHONE");
  }

  if (!/^[234]\d{7}$/.test(ADMIN_PHONE)) {
    throw new Error("ADMIN_PHONE must be 8 digits and start with 2, 3, or 4");
  }

  if (!/^\d{4}$/.test(ADMIN_PIN)) {
    throw new Error("ADMIN_PIN must be exactly 4 digits");
  }
};

const run = async () => {
  validateInput();

  await mongoose.connect(process.env.MONGODB_URL);

  const existing = await User.findOne({ phone: ADMIN_PHONE });
  if (existing) {
    if (existing.role !== "admin") {
      console.log(
        `User with phone ${ADMIN_PHONE} already exists but role is "${existing.role}". No changes made.`
      );
    } else {
      console.log(`Admin already exists (phone: ${ADMIN_PHONE}).`);
    }
    return;
  }

  const admin = await User.create({
    role: "admin",
    name: ADMIN_NAME,
    phone: ADMIN_PHONE,
    pin: ADMIN_PIN,
    createdVia: "admin",
  });

  console.log(`Admin created successfully. id=${admin._id} phone=${admin.phone}`);
};

run()
  .catch((err) => {
    console.error("seedAdmin failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (e) {
      // noop
    }
  });
