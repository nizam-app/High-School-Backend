import { createServer } from "http";
import mongoose from "mongoose";
import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { connectRedis, redisClient } from "./config/redis.js";
import Class from "./modules/class/class.model.js";
import Grade from "./modules/grade/grade.model.js";
import { Lesson } from "./modules/lessons/lesson.model.js";
import Notification from "./modules/notification/notification.model.js";
import UserNotification from "./modules/notification/userNotification.model.js";
import GeneralSettings from "./modules/settings/generalSettings.model.js";
import ThemeSettings from "./modules/settings/themeSettings.model.js";
import { initSocket, closeSocketServer } from "./socket/socket.js";
import {
  startNotificationScheduleCron,
  stopNotificationScheduleCron,
} from "./crons/notificationScheduleCron.js";
import {
  startSessionStatusCron,
  stopSessionStatusCron,
} from "./crons/sessionStatusCron.js";

const DEFAULT_PORT = Number(env.PORT) || 5000;
const host = env.HOST || "0.0.0.0";
const canRetryPort = env.NODE_ENV !== "production";
const MAX_PORT_RETRIES = canRetryPort ? 20 : 0;

let server;
let isShuttingDown = false;

const shutdown = (err, label) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error(label, err);

  if (server) {
    return server.close(() => process.exit(1));
  }
  process.exit(1);
};

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`[shutdown] ${signal} received, closing server...`);

  stopNotificationScheduleCron();
  stopSessionStatusCron();

  try {
    await closeSocketServer();
  } catch (e) {
    console.error("[shutdown] Socket.IO close error", e);
  }

  if (redisClient.isOpen) {
    try {
      await redisClient.quit();
    } catch (e) {
      console.error("[shutdown] Redis quit error", e);
    }
  }

  try {
    await mongoose.connection.close();
  } catch (e) {
    console.error("[shutdown] MongoDB close error", e);
  }

  if (server) {
    server.close(() => {
      console.info("[shutdown] HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("[shutdown] Forced exit after timeout");
      process.exit(1);
    }, 25_000).unref();
  } else {
    process.exit(0);
  }
};

const socketCorsOrigin =
  env.CORS_ORIGIN === "*"
    ? "*"
    : env.CORS_ORIGIN.split(",")
        .map((o) => o.trim())
        .filter(Boolean);

const startHttpServer = (port, retriesLeft = MAX_PORT_RETRIES) => {
  const httpServer = createServer(app);
  initSocket(httpServer, socketCorsOrigin.length ? socketCorsOrigin : "*");

  server = httpServer
    .listen(port, host, () => {
      console.info(
        `Server listening on http://${host}:${port} (NODE_ENV=${env.NODE_ENV})`
      );
    })
    .once("error", (err) => {
      if (err?.code === "EADDRINUSE" && retriesLeft > 0) {
        const fallbackPort = port + 1;
        console.warn(
          `Port ${host}:${port} is already in use. Retrying on ${host}:${fallbackPort}...`
        );
        return startHttpServer(fallbackPort, retriesLeft - 1);
      }
      if (err?.code === "EADDRINUSE") {
        err.message = `Port ${host}:${port} is already in use. Stop the existing process or change PORT in .env.`;
      }
      return shutdown(err, "serverListenError");
    });
};

process.once("unhandledRejection", (err) => shutdown(err, "unhandledRejection"));
process.once("uncaughtException", (err) => shutdown(err, "uncaughtException"));
process.once("SIGINT", () => void gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));

const start = async () => {
  try {
    await connectDB();
    // OTP flow disabled — Redis used for OTP signup/session state
    // await connectRedis();
    await Class.syncIndexes();
    await Grade.syncIndexes();
    await Lesson.syncIndexes();
    await Notification.syncIndexes();
    await UserNotification.syncIndexes();
    await GeneralSettings.syncIndexes();
    await ThemeSettings.syncIndexes();
    startSessionStatusCron();
    startHttpServer(DEFAULT_PORT);
    startNotificationScheduleCron();
  } catch (err) {
    shutdown(err, "startupError");
  }
};

start();
