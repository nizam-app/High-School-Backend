import { Server } from "socket.io";
import { authenticateSocket } from "./socketAuth.js";

let ioInstance = null;

export const getUserRoom = (userId) => `user:${String(userId)}`;
export const ADMINS_ROOM = "admins";

export const initSocket = (httpServer, corsOrigin = "*") => {
  if (ioInstance) return ioInstance;

  const allowAnyOrigin =
    corsOrigin === "*" ||
    (Array.isArray(corsOrigin) && corsOrigin.length === 1 && corsOrigin[0] === "*");

  ioInstance = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST", "PATCH"],
      credentials: !allowAnyOrigin,
    },
  });

  ioInstance.use(authenticateSocket);

  ioInstance.on("connection", (socket) => {
    const userId = socket?.user?.id;
    if (!userId) return socket.disconnect(true);

    socket.join(getUserRoom(userId));
    if (socket.user.role === "admin") {
      socket.join(ADMINS_ROOM);
    }

    socket.emit("socket:ready", {
      userId,
      role: socket.user.role,
      rooms: [getUserRoom(userId), socket.user.role === "admin" ? ADMINS_ROOM : null].filter(Boolean),
    });
  });

  return ioInstance;
};

export const getIo = () => ioInstance;

export const closeSocketServer = () =>
  new Promise((resolve) => {
    if (!ioInstance) return resolve();
    const io = ioInstance;
    ioInstance = null;
    io.close(() => resolve());
  });

export const emitToUser = (userId, eventName, payload) => {
  if (!ioInstance) return;
  ioInstance.to(getUserRoom(userId)).emit(eventName, payload);
};

export const emitToAdmins = (eventName, payload) => {
  if (!ioInstance) return;
  ioInstance.to(ADMINS_ROOM).emit(eventName, payload);
};
