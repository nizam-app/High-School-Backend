// src/middlewares/globalError.js

import AppError from "../utils/AppError.js";

// Express error middleware signature: (err, req, res, next)
export const globalError = (err, req, res, next) => {
  // default fallback
  const statusCode = err.statusCode || 500;
  const status = err.status || "error";

  // ----- Mongoose CastError: invalid ObjectId -----
  if (err.name === "CastError") {
    err = new AppError("Invalid ID format", 400);
  }

  // ----- Mongoose duplicate key error -----
  if (err.code === 11000) {
    // duplicate field name বের করা
    const field = Object.keys(err.keyValue || {})[0] || "field";
    err = new AppError(`${field} already exists`, 409);
  }

  // ----- Mongoose validation error -----
  if (err.name === "ValidationError") {
    // সব validation message একসাথে এনে string বানানো
    const msgs = Object.values(err.errors || {}).map((e) => e.message);
    err = new AppError(msgs.join(", "), 400);
  }

  // ----- JWT errors (optional) -----
  if (err.name === "JsonWebTokenError") err = new AppError("Invalid token", 401);
  if (err.name === "TokenExpiredError") err = new AppError("Token expired", 401);

  // final response
  res.status(err.statusCode || statusCode).json({
    status: err.status || status,
    message: err.message || "Something went wrong",
  });
};
