import jwt from "jsonwebtoken";
import env from "../config/env.js";
import User from "../modules/user/user.model.js";

const extractToken = (socket) => {
  const authToken = socket?.handshake?.auth?.token;
  if (authToken) return String(authToken).replace(/^Bearer\s+/i, "").trim();

  const header = socket?.handshake?.headers?.authorization || "";
  if (String(header).startsWith("Bearer ")) {
    return String(header).slice(7).trim();
  }

  const queryToken = socket?.handshake?.query?.token;
  if (queryToken) return String(queryToken).replace(/^Bearer\s+/i, "").trim();

  return "";
};

export const authenticateSocket = async (socket, next) => {
  try {
    const token = extractToken(socket);
    if (!token) return next(new Error("Unauthorized: token missing"));

    const payload = jwt.verify(token, env.JWT_SECRET);
    const userId = payload?.sub || payload?.userId;
    if (!userId) return next(new Error("Unauthorized: invalid token payload"));

    const user = await User.findById(userId).lean();
    if (!user) return next(new Error("Unauthorized: user not found"));
    if (user.status === "blocked") return next(new Error("Account disabled"));

    socket.user = {
      id: String(user._id),
      role: user.role,
      name: user.name,
    };

    return next();
  } catch (error) {
    return next(new Error("Unauthorized: invalid token"));
  }
};
