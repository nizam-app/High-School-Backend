const trimSlash = (s = "") => String(s).replace(/^\/+|\/+$/g, "");

const baseUploadsUrl = () => {
  const publicBase = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (publicBase) return `${publicBase}/uploads`;
  return "/uploads";
};

export const buildStoredFileMeta = (file, folderName = "general") => {
  if (!file) return null;

  const key = file.key || file.storageKey || file.filename || null;
  const url =
    file.location ||
    file.url ||
    (file.filename ? `${baseUploadsUrl()}/${trimSlash(folderName)}/${file.filename}` : null);

  return {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    storageKey: key,
    url,
  };
};

export const buildStoredFileMetaList = (files = [], folderName = "general") =>
  (Array.isArray(files) ? files : [])
    .map((f) => buildStoredFileMeta(f, folderName))
    .filter(Boolean);

