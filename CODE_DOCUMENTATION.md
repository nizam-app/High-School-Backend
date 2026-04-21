# High School Management Backend – Code Documentation

This document describes the **codebase structure**, **patterns**, and **key components** of the backend. For HTTP endpoints and request/response examples, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

---

## 1. Project Overview

- **Purpose**: REST API backend for a high-school management system (students, teachers, admins, classes, lessons, assignments, submissions, attendance, live sessions, notifications).
- **Stack**: Node.js (ESM), Express 4, MongoDB (Mongoose 8), JWT auth, optional AWS S3 for file uploads.
- **Entry**: `src/server.js` → loads env, connects DB, syncs indexes, starts HTTP server. `src/app.js` builds the Express app and mounts routes at `/api/v1`.

---

## 2. Directory Structure

```
High-School-Management-Backend/
├── package.json              # ESM, scripts: dev, start, seed:admin
├── .env                      # Environment variables (not committed)
├── Readme.md
├── API_DOCUMENTATION.md      # API endpoints & payloads
├── CODE_DOCUMENTATION.md     # This file – code structure & patterns
├── uploads/                  # Local file uploads (when USE_S3=false)
│   ├── lessons/
│   ├── assignments/
│   ├── submissions/
│   └── profiles/
└── src/
    ├── app.js                # Express app setup
    ├── server.js             # DB connect, index sync, HTTP server start
    ├── config/
    │   ├── env.js            # Required env (MONGODB_URL, JWT_*, PORT, HOST)
    │   ├── db.js             # connectDB()
    │   └── s3.js             # S3 client when USE_S3 + AWS_* set
    ├── middlewares/
    │   ├── auth.js           # requireAuth, restrictTo(roles)
    │   ├── upload.js         # makeUploader, makeImageUploader (multer / multer-s3)
    │   ├── globalError.js    # Central error handler
    │   └── notFound.js       # 404 for unknown routes
    ├── routes/
    │   └── index.js          # Mounts all module routers under /api/v1
    ├── utils/
    │   ├── AppError.js       # Custom error (statusCode, status, isOperational)
    │   ├── catchAsync.js     # Wraps async route handlers, forwards errors to next
    │   ├── sendResponse.js   # Standard JSON response helper
    │   ├── fileStorage.js    # buildStoredFileMeta / buildStoredFileMetaList
    │   ├── jwt.js            # signToken (currently unused; auth.service has own)
    │   └── educationRefs.js  # Grade/subject resolution helpers
    ├── seeds/
    │   └── seedAdmin.js      # npm run seed:admin
    └── modules/              # Feature modules (see Section 7)
        ├── activity/         # activityLog model only
        ├── admin/            # admin.router + many admin*.controller/service
        ├── assignment/
        ├── attendance/
        ├── auth/
        ├── class/
        ├── grade/
        ├── lessons/
        ├── notification/     # Models only
        ├── Profile/
        ├── session/
        ├── settings/         # appSetting model only
        ├── students/
        ├── subject/
        ├── submisssion/      # Note: folder name has 3 s
        ├── Teacher/
        ├── timetable/        # timetableSlot model only
        └── user/
```

---

## 3. Entry Points

### 3.1 `src/server.js`

- Loads env via `config/env.js` (used by other imports).
- Connects to MongoDB with `connectDB()` from `config/db.js`.
- Syncs indexes for `Class`, `Grade`, `Lesson`.
- Starts HTTP server with `app.listen(port, host)`.
- On `EADDRINUSE`, retries on `port+1` up to a limit.
- Listens for `unhandledRejection` and `uncaughtException` and shuts down the process.

### 3.2 `src/app.js`

- **CORS**: `origin` from `process.env.CORS_ORIGIN?.split(",")` or `"*"`.
- **Body parsing**: JSON only for `application/json` and non-GET/HEAD.
- **Routes**:
  - `GET /` → `"Api is running..."`.
  - `app.use("/uploads", express.static("uploads"))` for local uploads.
  - `app.use("/api/v1", routes)` where `routes` is from `routes/index.js`.
- **Error handling**: `notFound` then `globalError` (must be last).

---

## 4. Configuration

### 4.1 `src/config/env.js`

- Calls `dotenv.config()`.
- **Required** (throws if missing): `MONGODB_URL`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`.
- **Exports**: `env.PORT` (default 5000), `env.MONGODB_URL`, `env.JWT_SECRET`, `env.JWT_ACCESS_EXPIRES_IN`, `env.HOST` (default `"0.0.0.0"`).

### 4.2 `src/config/db.js`

- `connectDB()`: `mongoose.connect(env.MONGODB_URL)`.

### 4.3 `src/config/s3.js`

- Reads: `USE_S3`, `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- `isS3Ready`: `true` only when `USE_S3 === "true"` and all AWS vars are set.
- `s3Client`: instantiated only when `isS3Ready`; used by `upload.js` for multer-s3.

---

## 5. Middlewares

### 5.1 `src/middlewares/auth.js`

- **`requireAuth`**
  - Expects `Authorization: Bearer <token>`.
  - Verifies JWT with `env.JWT_SECRET`, loads user by `payload.sub` (or `userId`), rejects if user missing or `status === "blocked"`.
  - Sets `req.user` (Mongoose user document).
  - On any failure: passes `AppError` to `next` with 401 (or 403 for blocked).

- **`restrictTo(...roles)`**
  - Factory that returns a middleware.
  - Ensures `req.user.role` is one of the given roles (e.g. `"admin"`, `"teacher"`, `"student"`); otherwise 403.

**Usage**: Most protected routes use `requireAuth` and optionally `restrictTo("admin")` or `restrictTo("teacher", "admin")`, etc.

### 5.2 `src/middlewares/upload.js`

- **`makeUploader(folderName)`**
  - Returns a multer instance.
  - **Storage**: If `isS3Ready`, uses `multer-s3` with `s3Client` and `s3Config.bucket`; key pattern: `folderName/<timestamp>_<safeFilename>`.
  - If not S3: `multer.diskStorage` under `uploads/<folderName>/`.
  - **File filter**: Allows a fixed set of MIME types (PDF, DOC, DOCX, TXT, images, videos) and enforces max size (e.g. 200 MB for general uploader).
  - Throws at module/init time if `USE_S3=true` but AWS env is incomplete or `multer-s3` is missing.

- **`makeImageUploader(folderName)`**
  - Same pattern but only image MIME types and smaller max size (e.g. 10 MB).
  - Used for profile images (`profiles` folder).

**Used folders**: `lessons`, `assignments`, `submissions`, `profiles`.

### 5.3 `src/middlewares/globalError.js`

- Express error middleware: `(err, req, res, next)`.
- Normalizes:
  - **Mongoose CastError** → 400 "Invalid ID format".
  - **Mongoose duplicate key (11000)** → 409 "<field> already exists".
  - **Mongoose ValidationError** → 400 with concatenated validation messages.
  - **JWT JsonWebTokenError / TokenExpiredError** → 401.
- Sends JSON: `{ status, message }`. Uses `err.statusCode` and `err.status` when present (e.g. from `AppError`).

### 5.4 `src/middlewares/notFound.js`

- For requests that hit no route: responds with 404 via `AppError` (or similar) so `globalError` can format the response.

---

## 6. Utils

### 6.1 `AppError` (`src/utils/AppError.js`)

- Extends `Error`.
- Constructor: `(message, statusCode = 500)`.
- Sets `status` from status code (4xx → `"fail"`, 5xx → `"error"`), `isOperational = true`.
- Used by controllers and services to pass HTTP errors to `next(err)`.

### 6.2 `catchAsync` (`src/utils/catchAsync.js`)

- `catchAsync(fn)` returns a function `(req, res, next)` that runs `fn(req, res, next)` and forwards any rejected promise to `next(err)`.
- Ensures async route handlers do not need try/catch; errors go to `globalError`.

### 6.3 `sendResponse` (`src/utils/sendResponse.js`)

- `sendResponse(res, { statusCode, status, message, data, meta })`.
- Sends a JSON body with `status`, `message`, and optionally `data` and `meta`.
- Used by many controllers for a consistent response shape.

### 6.4 `fileStorage` (`src/utils/fileStorage.js`)

- **`buildStoredFileMeta(file, folderName)`**
  - Builds a single attachment object: `{ originalName, mimeType, size, storageKey, url }`.
  - `storageKey`: from `file.key` (S3), `file.storageKey`, or `file.filename`.
  - `url`: from `file.location` (S3), `file.url`, or local: `PUBLIC_BASE_URL/uploads/<folderName>/<filename>`.
  - Used after multer (or multer-s3) has run; `file` is the object multer attaches to `req.file` / `req.files`.

- **`buildStoredFileMetaList(files, folderName)`**
  - Maps an array of files to an array of stored file metadata; filters out nulls.
  - Used by lesson, assignment, and submission services to persist attachment metadata (e.g. `Lesson.files`, `Assignment.attachments`).

- **`PUBLIC_BASE_URL`**: From `process.env.PUBLIC_BASE_URL`; used only for local URLs when S3 is not used. No trailing slash.

### 6.5 `educationRefs.js`

- Helpers to resolve grade/subject by ID or label; used by auth and user services for validation and assignment.

### 6.6 `jwt.js`

- Exports `signToken`. **Not used** in the current codebase; `auth.service.js` implements its own token signing.

---

## 7. Module Pattern and Route Mapping

Each feature module typically has:

- **Model**: Mongoose schema(s) in `*.model.js`.
- **Service**: Business logic in `*.service.js` (validation, DB operations, calling `fileStorage` for attachments).
- **Controller**: Route handlers in `*.controller.js`; use `catchAsync`, call service, send response via `res.json(...)` or `sendResponse`.
- **Router**: Express router in `*.router.js`; applies `requireAuth` / `restrictTo`, upload middleware where needed, and maps methods to controller functions.

**Route mounting** (`src/routes/index.js`):

| Mount path   | Module      | Router variable   |
|-------------|-------------|--------------------|
| `/auth`     | auth        | authRouter         |
| `/users`    | user        | userRouter         |
| `/lesson`    | lessons     | lessonRouter       |
| `/assignments` | assignment | assignmentRouter   |
| `/sessions` | session     | sessionRouter      |
| `/classes`  | class       | classsRouter       |
| `/submission` | submisssion | submissionRouter   |
| `/profiles` | Profile     | profileRouter      |
| `/subjects` | subject     | subjectRouter     |
| `/grades`   | grade       | gradeRouter       |
| `/students` | students    | studentRouter     |
| `/teachers`| Teacher     | teacherRouter     |
| `/attendance` | attendance | attendanceRouter  |
| `/admin`    | admin       | adminRouter       |

Additional: `GET /api/v1/health` → `"API is healthy"`.

---

## 8. Auth and Roles

- **Credentials**: Phone + 4-digit PIN (no password). PIN is hashed with bcrypt in `User` model.
- **Login**: `auth.service` validates phone/PIN, returns JWT and user profile. Token payload includes `sub` (user id) and `role`.
- **Authorization**: After `requireAuth`, `req.user` is the full user document. Role-based routes use `restrictTo("student" | "teacher" | "admin")`.
- **Roles**: Stored in `User.role`; used in controllers to scope data (e.g. teacher sees own lessons, student sees published lessons for their grade/subjects).

---

## 9. File Upload Flow

1. **Route** uses multer from `makeUploader` or `makeImageUploader` (e.g. `makeUploader("lessons").array("files", 5)`).
2. **Multer** writes to disk (`uploads/<folder>`) or to S3 (key `folderName/<timestamp>_<filename>`).
3. **Controller** passes `req.files` (or `req.file`) and folder name to the **service**.
4. **Service** calls `buildStoredFileMetaList(files, "lessons")` (or single file + `buildStoredFileMeta`) and saves the result into the document (e.g. `Lesson.files`, `Assignment.attachments`).
5. **Response** includes stored `url` and `storageKey` for each attachment. For S3, `url` is the S3 object URL (e.g. `https://bucket.s3.region.amazonaws.com/key`). For local, `url` uses `PUBLIC_BASE_URL/uploads/...`.

**Bucket/object permissions**: If S3 is used and the bucket is private, direct URLs will return Access Denied unless you use bucket policy or presigned URLs. The codebase does not currently generate presigned URLs.

---

## 10. Error Handling Flow

1. Controller (or service) throws or calls `next(new AppError(message, statusCode))`.
2. Async errors are caught by `catchAsync` and passed to `next(err)`.
3. Multer/validation errors (e.g. invalid file type) may be passed as generic `Error`; `globalError` does not map those to 4xx explicitly, so they can surface as 500.
4. `globalError` maps Mongoose and JWT errors to appropriate status and JSON `{ status, message }`.

---

## 11. Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URL` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret for signing/verifying JWT |
| `JWT_ACCESS_EXPIRES_IN` | Yes | Token expiry (e.g. `7d`) |
| `PORT` | No | Server port (default 5000) |
| `HOST` | No | Bind address (default `0.0.0.0`) |
| `USE_S3` | No | `"true"` to use S3 for uploads |
| `AWS_REGION` | If S3 | e.g. `eu-west-3` |
| `AWS_S3_BUCKET` | If S3 | Bucket name |
| `AWS_ACCESS_KEY_ID` | If S3 | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | If S3 | IAM secret key |
| `PUBLIC_BASE_URL` | No | Base URL for local file links (e.g. `http://103.208.181.235:5005`) |
| `CORS_ORIGIN` | No | Comma-separated origins; default `*` |
| `ADMIN_PHONE`, `ADMIN_PIN`, `ADMIN_NAME` | For seed | Used by `seed:admin` |

---

## 12. Naming and Conventions

- **Router file**: `class` module uses `classs.router.js` (three s) because `class` is a reserved word.
- **Folder**: Submission module folder is `submisssion` (three s).
- **Response shape**: Some routes return `{ success: true, data }`, others use `sendResponse` with `{ status, message, data }`. Both are in use.
- **Controllers**: Prefer `catchAsync` for async handlers; use `AppError` for business logic errors.

---

## 13. Related Files

- **API endpoints, request/response shapes, Postman variables**: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- **Project readme**: [Readme.md](./Readme.md)
