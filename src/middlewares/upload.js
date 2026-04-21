import multer from "multer";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { s3Client, s3Config, isS3Ready } from "../config/s3.js";

const require = createRequire(import.meta.url);
let multerS3 = null;
try {
  multerS3 = require("multer-s3");
} catch {
  multerS3 = null;
}

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const allowedMime = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const allowedImageMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const buildUploader = (
  folderName,
  allowedSet,
  invalidTypeMessage,
  maxSizeMb = 20
) => {
  const uploadDir = path.resolve("uploads", folderName);
  if (!isS3Ready) ensureDir(uploadDir);

  if (s3Config.useS3 && !isS3Ready) {
    throw new Error(
      "USE_S3=true but AWS env vars are missing. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY."
    );
  }
  if (isS3Ready && !multerS3) {
    throw new Error(
      "USE_S3=true but multer-s3 is not installed. Run: npm i @aws-sdk/client-s3 multer-s3"
    );
  }

  const storage =
    isS3Ready && multerS3
      ? multerS3({
          s3: s3Client,
          bucket: s3Config.bucket,
          contentType: multerS3.AUTO_CONTENT_TYPE,
          key: (req, file, cb) => {
            const safe = file.originalname.replace(/\s+/g, "_");
            cb(null, `${folderName}/${Date.now()}_${safe}`);
          },
        })
      : multer.diskStorage({
          destination: (req, file, cb) => cb(null, uploadDir),
          filename: (req, file, cb) => {
            const safe = file.originalname.replace(/\s+/g, "_");
            cb(null, `${Date.now()}_${safe}`);
          },
        });

  const fileFilter = (req, file, cb) => {
    if (!allowedSet.has(file.mimetype)) {
      return cb(new Error(invalidTypeMessage));
    }
    cb(null, true);
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
  });
};

export const makeUploader = (folderName = "general") => {
  return buildUploader(
    folderName,
    allowedMime,
    "Only PDF, DOC, DOCX, TXT, image, and video files are allowed",
    200
  );
};

export const makeImageUploader = (folderName = "images") => {
  return buildUploader(
    folderName,
    allowedImageMime,
    "Only JPG, PNG, WEBP, GIF images are allowed",
    10
  );
};
