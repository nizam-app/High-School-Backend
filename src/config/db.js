// src/config/db.js
import mongoose from "mongoose";
import { env } from "./env.js";

export const connectDB = async () => {
  await mongoose.connect(env.MONGODB_URL);
  console.log("✅ MongoDB connected");
};
