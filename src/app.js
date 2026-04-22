import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import routes from "./routes/index.js";
import smsApiRouter from "./modules/sms/sms.api.router.js";
import cors from "cors";
import path from "path";
import { notFound } from "./middlewares/notFound.js";
import { globalError } from "./middlewares/globalError.js";
import { env } from "./config/env.js";

const app = express();

if (env.TRUST_PROXY) {
  app.set("trust proxy", env.TRUST_PROXY);
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const corsOrigins =
  env.CORS_ORIGIN === "*"
    ? "*"
    : env.CORS_ORIGIN.split(",")
        .map((o) => o.trim())
        .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
    credentials: corsOrigins !== "*",
  })
);

if (env.isProduction) {
  const apiLimiter = rateLimit({
    windowMs: env.API_RATE_LIMIT_WINDOW_MS,
    max: env.API_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
  });
  app.use("/api", apiLimiter);
}

const jsonParser = express.json({ limit: env.JSON_BODY_LIMIT });
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  if (req.is("application/json")) return jsonParser(req, res, next);
  return next();
});

app.get("/", (req, res) => {
  res.send("Api is running...");
});

app.use("/uploads", express.static(path.resolve("uploads")));

app.use("/api", smsApiRouter);
app.use("/api/v1", routes);

app.use(notFound);
app.use(globalError);

export default app;
