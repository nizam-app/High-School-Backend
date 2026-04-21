import cron from "node-cron";
import Session from "../modules/session/session.model.js";

const getSessionStartDateTime = (session) => {
  if (!session.date || !session.time) return null;

  const start = new Date(session.date);
  const [hoursStr, minutesStr] = String(session.time || "00:00").split(":");
  const hours = Number(hoursStr) || 0;
  const minutes = Number(minutesStr) || 0;

  start.setHours(hours, minutes, 0, 0);
  return start;
};

const getSessionEndDateTime = (session) => {
  const start = getSessionStartDateTime(session);
  if (!start) return null;

  const durationMinutes = Number(session.duration || 0);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return start;
  }

  return new Date(start.getTime() + durationMinutes * 60 * 1000);
};

export const runSessionStatusUpdate = async () => {
  const now = new Date();

  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  try {
    const approvedSessions = await Session.find({
      status: "approved",
      date: { $gte: windowStart, $lte: windowEnd },
    }).select("_id date time duration status");

    const updatesApproved = [];

    for (const s of approvedSessions) {
      const startDateTime = getSessionStartDateTime(s);
      if (!startDateTime) continue;

      if (startDateTime <= now) {
        updatesApproved.push({
          updateOne: {
            filter: { _id: s._id, status: "approved" },
            update: { $set: { status: "ongoing", startedAt: now } },
          },
        });
      }
    }

    if (updatesApproved.length > 0) {
      await Session.bulkWrite(updatesApproved);
    }
  } catch (err) {
    console.error("[session-cron] Error updating approved → ongoing:", err);
  }

  try {
    const ongoingSessions = await Session.find({
      status: "ongoing",
      date: { $gte: windowStart, $lte: windowEnd },
    }).select("_id date time duration status");

    const updatesOngoing = [];

    for (const s of ongoingSessions) {
      const endDateTime = getSessionEndDateTime(s);
      if (!endDateTime) continue;

      if (endDateTime <= now) {
        updatesOngoing.push({
          updateOne: {
            filter: { _id: s._id, status: "ongoing" },
            update: { $set: { status: "completed", endedAt: now } },
          },
        });
      }
    }

    if (updatesOngoing.length > 0) {
      await Session.bulkWrite(updatesOngoing);
    }
  } catch (err) {
    console.error("[session-cron] Error updating ongoing → completed:", err);
  }
};

export const startSessionStatusCron = () => {
  cron.schedule("* * * * *", async () => {
    try {
      await runSessionStatusUpdate();
    } catch (err) {
      console.error("[session-cron] Unhandled error:", err);
    }
  });

  console.log("[session-cron] Session status updater scheduled (every minute)");
};

