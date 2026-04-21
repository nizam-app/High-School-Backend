// src/utils/sendResponse.js

// সব response একই ফরম্যাটে পাঠাতে helper
const sendResponse = (
  res,
  {
    statusCode = 200,
    status = "success",
    message = "OK",
    data = null,
    meta = null,
    ...extra
  }
) => {
  const payload = { status, message };
  if (meta) payload.meta = meta;
  if (data !== null) payload.data = data;
  Object.assign(payload, extra);

  return res.status(statusCode).json(payload);
};

export default sendResponse;
