import AppError from "../../utils/AppError.js";
import { resolveStudentGradeFromPayload } from "../../utils/gradeValidation.js";

const normalizeStr = (v) => String(v || "").trim();
const isValidPin = (pin) => /^\d{4}$/.test(String(pin || ""));

export const validateAdminCreateUserPayload = async (payload = {}) => {
  const role = normalizeStr(payload.role).toLowerCase();
  const name = normalizeStr(payload.name || payload.fullName);
  const phone = normalizeStr(payload.phone);
  const pin = normalizeStr(payload.pin);

  if (!role || !["student", "teacher"].includes(role)) {
    throw new AppError("Role must be student or teacher", 400);
  }
  if (!name) throw new AppError("Name is required", 400);
  if (!phone) throw new AppError("Phone is required", 400);
  if (!pin) throw new AppError("PIN is required", 400);
  if (!isValidPin(pin)) throw new AppError("PIN must be exactly 4 digits", 400);

  let studentGrade = null;
  if (role === "student") {
    studentGrade = await resolveStudentGradeFromPayload(payload);
  }

  return { role, name, phone, pin, studentGrade };
};
