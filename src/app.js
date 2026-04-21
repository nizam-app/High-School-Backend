import express from 'express';
import routes from './routes/index.js';
import smsApiRouter from './modules/sms/sms.api.router.js';
import cors from 'cors';
import path from "path";
import { notFound } from './middlewares/notFound.js';
import { globalError } from './middlewares/globalError.js';
import { startSessionStatusCron } from "./crons/sessionStatusCron.js";

const app = express();


app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",") || "*",
}));

const jsonParser = express.json();
app.use((req, res, next) => {
  // GET/HEAD endpoints should not require JSON body parsing.
  if (req.method === "GET" || req.method === "HEAD") return next();
  // Parse JSON only when content-type is JSON.
  if (req.is("application/json")) return jsonParser(req, res, next);
  return next();
});

app.get('/', (req, res) => {
    res.send("Api is running...")
})

app.use("/uploads", express.static(path.resolve("uploads")));

// SMS API: POST /api/sendsms, GET /api/sms-statistics (exact paths per spec)
app.use("/api", smsApiRouter);
app.use('/api/v1', routes);

app.use(notFound);
app.use(globalError);

// Start background cron jobs (session status updates)
startSessionStatusCron();

export default app;
