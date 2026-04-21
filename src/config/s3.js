import { S3Client } from "@aws-sdk/client-s3";

const normalize = (v) => String(v || "").trim();

export const s3Config = {
  useS3: normalize(process.env.USE_S3).toLowerCase() === "true",
  region: normalize(process.env.AWS_REGION),
  bucket: normalize(process.env.AWS_S3_BUCKET),
  accessKeyId: normalize(process.env.AWS_ACCESS_KEY_ID),
  secretAccessKey: normalize(process.env.AWS_SECRET_ACCESS_KEY),
};
console.log("S3 Config:", s3Config.region);
const hasCredentials =
  s3Config.region &&
  s3Config.bucket &&
  s3Config.accessKeyId &&
  s3Config.secretAccessKey;

export const isS3Ready = Boolean(s3Config.useS3 && hasCredentials);

export const s3Client = isS3Ready
  ? new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
    })
  : null;

