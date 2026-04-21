import { createClient } from "redis";
import env from "./env.js";

export const redisClient = createClient({
  url: env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => (retries > 3 ? false : Math.min(retries * 200, 1000)),
  },
});

let loggedError = false;
redisClient.on("error", (err) => {
  if (!loggedError) {
    console.error("Redis error", err?.message || err);
    loggedError = true;
  }
});

let isConnected = false;

export const connectRedis = async () => {
  if (isConnected) return redisClient;
  try {
    await redisClient.connect();
    isConnected = true;
    loggedError = false;
    console.log("Redis connected");
  } catch (err) {
    isConnected = false;
    console.warn("Redis unavailable. OTP endpoints will return 503 until Redis is up.");
  }
  return redisClient;
};
