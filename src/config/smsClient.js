import axios from "axios";
import env from "./env.js";

export const smsClient = axios.create({
  baseURL: env.SMS_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Basic ${env.SMS_AUTH_TOKEN}`,
  },
});

