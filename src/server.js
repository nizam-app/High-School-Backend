import { createServer } from "http";
import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import Class from "./modules/class/class.model.js";
import Grade from "./modules/grade/grade.model.js";
import { Lesson } from "./modules/lessons/lesson.model.js";
import Notification from "./modules/notification/notification.model.js";
import UserNotification from "./modules/notification/userNotification.model.js";
import GeneralSettings from "./modules/settings/generalSettings.model.js";
import ThemeSettings from "./modules/settings/themeSettings.model.js";
import { initSocket } from "./socket/socket.js";
import { startNotificationScheduleCron } from "./crons/notificationScheduleCron.js";

const DEFAULT_PORT = Number(env.PORT) || 5000;
const host = env.HOST || "0.0.0.0";
console.log(host);
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

const startHttpServer = (port, retriesLeft = MAX_PORT_RETRIES) => {
  const httpServer = createServer(app);
  initSocket(httpServer, env.CORS_ORIGIN?.split(",") || "*");

  server = httpServer
    .listen(port, host, () => {
      console.log(`server is running on port ${host}:${port}`);
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

const start = async () => {
  try {
    await connectDB();
    await connectRedis();
    await Class.syncIndexes();
    await Grade.syncIndexes();
    await Lesson.syncIndexes();
    await Notification.syncIndexes();
    await UserNotification.syncIndexes();
    await GeneralSettings.syncIndexes();
    await ThemeSettings.syncIndexes();
    startHttpServer(DEFAULT_PORT);
    startNotificationScheduleCron();
  } catch (err) {
    shutdown(err, "startupError");
  }
};

start();
