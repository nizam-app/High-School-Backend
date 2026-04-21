import jwt from "jsonwebtoken";
import env from "../config/env.js";

export const signToken = (user) =>
  jwt.sign(
    { userId: user._id.toString(), role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN || "7d" }
  );
