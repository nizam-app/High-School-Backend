# High School Management Backend API Documentation

## Base Info
- Base URL: `{{base_url}}/api/v1`
- Auth: `Authorization: Bearer {{token}}`
- Health: `GET /health`
- Root ping: `GET /`
- Static uploads: `GET /uploads/...`

## Common Response Shapes
- Success (most routes):
```json
{
  "status": "success",
  "message": "Request successful",
  "data": {}
}
```
- Success (some routes):
```json
{
  "success": true,
  "data": {}
}
```
- Error:
```json
{
  "status": "fail",
  "message": "Error message"
}
```

## Postman Environment Variables
- `base_url`
- `admin_token`
- `teacher_token`
- `student_token`
- `grade_id`
- `subject_id`
- `class_id`
- `lesson_id`
- `assignment_id`
- `session_id`
- `student_id`
- `submission_id`
- `phone`
- `otp`

---

## 1) Auth APIs

### `POST /auth/register` (Public)
Create student/teacher/admin account.

Student example:
```json
{
  "role": "student",
  "name": "Fatima Ahmed",
  "phone": "24587569",
  "pin": "1234",
  "confirmPin": "1234",
  "gradeId": "{{grade_id}}",
  "assignedSubjectIds": ["{{subject_id}}"]
}
```

Teacher example:
```json
{
  "role": "teacher",
  "name": "Alice",
  "phone": "34587569",
  "pin": "1234",
  "confirmPin": "1234",
  "subjectId": "{{subject_id}}",
  "assignedGradeIds": ["{{grade_id}}"]
}
```

Notes:
- If you send labels instead of IDs, use:
  - `gradeLevel`, `assignedSubjects`, `subject`, `assignedGrades`
- `assignedGrades` must be labels (`"4th"`, `"5th"`, `"6th"`, `"7th"`), not ObjectId.

### `POST /auth/login` (Public)
```json
{
  "phone": "24587569",
  "pin": "1234"
}
```

### `POST /otp/send` (Public)
Send OTP to phone via SMS provider.
```json
{
  "phone": "33445566"
}
```

### `POST /otp/verify` (Public)
Verify received OTP code.
```json
{
  "phone": "33445566",
  "otp": "4821"
}
```

### `POST /otp/resend` (Public)
Resend OTP for active OTP session.
```json
{
  "phone": "33445566"
}
```

### `GET /sms/statistics` (Public)
Fetch SMS provider statistics/balance.

### `GET /auth/me` (Auth)

---

## 2) Student Screen APIs

### Home Dashboard
- `GET /students/dashboard` (Student)
- `GET /students/progress/overview` (Student)

### Classes
- `GET /students/student/classes` (Student)
- `GET /classes/student/my` (Student)

### Timetable
- `GET /students/timetable` (Student)

### Live Sessions
- `GET /sessions/student` (Student)
- `GET /sessions/student/:id` (Student)
- `GET /sessions/:id` (Auth)
- `POST /sessions/:id/join` (Student)

### Assignments
- `GET /assignments/student/my` (Student)
- `GET /assignments/scope?gradeId={{grade_id}}&subjectId={{subject_id}}` (Student)
- `GET /assignments/:assignmentId` (Student)

### Submit Assignment
- `POST /submission/:assignmentId/submit` (Student, `multipart/form-data`)
  - file key: `file` (optional)
  - text key: `textAnswer` (optional)
- `GET /submission/assignments/:assignmentId/submission/me` (Student)

### Lessons
- `GET /lesson/scope?gradeId={{grade_id}}&subjectId={{subject_id}}` (Student)
- `GET /lesson/:lessonId` (Student)

---

## 3) Teacher Screen APIs

### Dashboard
- `GET /teachers/dashboard` (Teacher)

### Classes
- `GET /classes/my` (Teacher)
- `GET /classes/:classId` (Teacher, Admin)

### Students
- `GET /teachers/students?search=` (Teacher)
- `GET /teachers/stats/students?subject=&gradeLevel=&search=` (Teacher)
- `GET /teachers/students/:studentId/progress?classId={{class_id}}` (Teacher)
- `GET /teachers/students/:studentId/attendance?classId={{class_id}}` (Teacher)
- `POST /teachers/students/:studentId/attendance` (Teacher)
```json
{
  "classId": "{{class_id}}",
  "status": "Present",
  "date": "2026-02-24"
}
```

### Lessons
- `POST /lesson` (Teacher/Admin, `multipart/form-data`)
- `PATCH /lesson/:lessonId` (Teacher/Admin, `multipart/form-data`)
- `DELETE /lesson/:lessonId` (Teacher/Admin)

Create lesson form-data fields:
- `title` (required)
- `description`
- `contentType` (`text`, `pdf`, `video`, `image`, `quiz`, required)
- `chapter` (required)
- `status` (`draft` or `published`)
- `gradeId` (required)
- `subjectId` (required)
- `classId` (optional)
- `date` (optional, ISO/string)
- `files` (required when `contentType=pdf|video|image`)

### Assignments
- `POST /assignments` (Teacher, `multipart/form-data`)
- `PATCH /assignments/:assignmentId` (Teacher/Admin)
- `DELETE /assignments/:assignmentId` (Teacher/Admin)
- `GET /assignments/:assignmentId/submissions` (Teacher)

Create assignment fields:
- `title` (required)
- `description`
- `dueDate` (required, `YYYY-MM-DD`)
- `dueTime` (optional, `HH:mm`)
- `points` (required, >0)
- `gradeId` (required)
- `subjectId` (required)
- `classId` (optional)
- file key: `file` (optional)

### Grade Submission
- `PATCH /submission/submissions/:submissionId/grade` (Teacher)
```json
{
  "score": 90,
  "feedback": "Good work"
}
```

### Live Sessions
- `POST /sessions` (Teacher)
- `GET /sessions/teacher` (Teacher)
- `GET /sessions/teacher/:id` (Teacher)
- `PUT /sessions/:id` (Teacher)
- `PUT /sessions/:id/complete` (Teacher)
- `DELETE /sessions/:id` (Teacher/Admin)

Create session example:
```json
{
  "title": "Mathematics Q&A Session",
  "gradeId": "{{grade_id}}",
  "subjectId": "{{subject_id}}",
  "classId": "{{class_id}}",
  "className": "5th Grade - Math A",
  "date": "2026-02-25",
  "time": "10:00",
  "duration": 60,
  "zoomLink": "https://zoom.us/j/12345678901"
}
```

### Attendance
- `POST /attendance/classes/:classId` (Teacher/Admin)
- `GET /attendance/classes/:classId?from=&to=` (Teacher/Admin)
- `GET /attendance/students/:studentId/summary?from=&to=` (Teacher/Admin)

Mark class attendance:
```json
{
  "date": "2026-02-24",
  "records": [
    { "studentId": "{{student_id_1}}", "status": "Present", "notes": "On time" },
    { "studentId": "{{student_id_2}}", "status": "Late", "notes": "10 min late" },
    { "studentId": "{{student_id_3}}", "status": "Absent", "notes": "Sick leave" }
  ]
}
```

Status values:
- `Present`
- `Absent`
- `Late`

Important:
- Class must already contain students in `class.students`.
- Assign class students using admin class update:
  - `PATCH /admin/classes/:id`
  - body: `{ "students": ["studentId1", "studentId2"] }`

---

## 4) Admin Panel APIs (`/admin`)

### Dashboard
- `GET /admin/dashboard/overview`

### User Management
- `GET /admin/users/stats`
- `GET /admin/users`
- `POST /admin/users`
- `PATCH /admin/users/:id/status`
- `PATCH /admin/users/:id`
- `DELETE /admin/users/:id`

### Classes & Content (Classes tab)
- `GET /admin/classes?page=1&limit=20`
- `POST /admin/classes` (teacherId optional)
- `PATCH /admin/classes/:id`
- `DELETE /admin/classes/:id`
- `GET /admin/subjects/summary`
- `GET /admin/grades/sections`
- `GET /admin/content/stats`

### Classes & Content (Content Library / Lessons tab)
- `GET /admin/lessons/meta`
- `GET /admin/lessons?page=1&limit=20&status=all&contentType=all`
- `GET /admin/lessons/:id`
- `PATCH /admin/lessons/:id`
- `DELETE /admin/lessons/:id`

### Assignments
- `GET /admin/assignments/stats`
- `GET /admin/assignments`
- `POST /admin/assignments` (`multipart/form-data`)
- `PATCH /admin/assignments/:id` (`multipart/form-data`)
- `GET /admin/assignments/:id/submissions`

### Live Sessions
- `GET /admin/live-sessions/stats`
- `GET /admin/live-sessions`
- `POST /admin/live-sessions`
- `PATCH /admin/live-sessions/:id`
- `PATCH /admin/live-sessions/:id/approve`
- `PATCH /admin/live-sessions/:id/reject`
- `DELETE /admin/live-sessions/:id`

### Timetable
- `GET /admin/timetable/meta`
- `GET /admin/timetable`
- `POST /admin/timetable/entries`
- `PATCH /admin/timetable/entries/:id`
- `DELETE /admin/timetable/entries/:id`

### Notifications
- `GET /admin/notifications/stats`
- `GET /admin/notifications/:id/stats`
- `GET /admin/notifications`
- `POST /admin/notifications`
- `PATCH /admin/notifications/:id`

### Settings
- `GET /admin/settings/subjects-grades`
- `GET /admin/settings`
- `PATCH /admin/settings/general`
- `PATCH /admin/settings/theme`
- `PATCH /admin/settings/security`

### Analytics
- `GET /admin/analytics/overview?from=&to=`
- `GET /admin/analytics/student-progress?from=&to=`
- `GET /admin/analytics/teacher-activity?from=&to=`

---

## 5) Core Non-Admin APIs

### Users
- `POST /users` (Admin)
- `GET /users/me` (Auth)
- `GET /users` (Admin)
- `GET /users/:id` (Admin)
- `PATCH /users/:id/assigned-subjects` (Admin)
- `PATCH /users/:id` (Admin)
- `DELETE /users/:id` (Admin)

### Classes
- `POST /classes` (Admin)
- `GET /classes/my` (Teacher)
- `GET /classes/student/my` (Student)
- `GET /classes/admin` (Admin)
- `GET /classes/:classId` (Admin, Teacher)
- `PATCH /classes/:classId/schedule` (Admin)
- `PUT /classes/:classId/schedule` (Admin)

### Profiles
- `POST /profiles` (Auth, `multipart/form-data`)
- `POST /profiles/:userId` (Admin, `multipart/form-data`)
- `GET /profiles/me` (Auth)
- `PATCH /profiles/me` (Auth, `multipart/form-data`)
- `DELETE /profiles/me` (Auth)
- `GET /profiles` (Admin)
- `GET /profiles/:id` (Admin)
- `PATCH /profiles/:id` (Admin, `multipart/form-data`)
- `DELETE /profiles/:id` (Admin)

### Attendance
- `POST /attendance/classes/:classId` (Teacher/Admin)
- `GET /attendance/classes/:classId?from=&to=` (Teacher/Admin)
- `GET /attendance/students/:studentId/summary?from=&to=` (Teacher/Admin)

### Subjects
- `GET /subjects` (Auth)
- `GET /subjects/:id` (Auth)
- `POST /subjects` (Admin)
- `PATCH /subjects/:id` (Admin)
- `DELETE /subjects/:id` (Admin)

### Grades
- `GET /grades` (Auth)
- `GET /grades/:id` (Auth)
- `POST /grades` (Admin)
- `PATCH /grades/:id` (Admin)
- `DELETE /grades/:id` (Admin)

---

## 6) Suggested Postman Test Order (Screen-by-Screen)

1. `POST /auth/login` (admin)  
2. Admin setup: grades, subjects, class, teacher, student  
3. `POST /auth/login` (teacher)  
4. Teacher quick actions: create lesson, assignment, session  
5. `POST /auth/login` (student)  
6. Student home: dashboard, progress overview  
7. Student classes + timetable  
8. Student assignments + submit  
9. Student live sessions + join  
10. Teacher students tab: progress + attendance + mark attendance  
11. Admin panel routes (`/admin/...`) verification

---

## 7) Important Implementation Notes
- Prefer ID-first payloads:
  - `gradeId`, `subjectId`, `assignedGradeIds`, `assignedSubjectIds`, `classId`
- String fallbacks are still supported in some flows:
  - `gradeLevel`, `subject`, `assignedGrades`, `assignedSubjects`
- File upload keys:
  - Lessons: `files`
  - Assignments: `file` (teacher routes), `files` (admin routes)
  - Submissions: `file`
  - Profiles: `profileImage`
- `POST /admin/classes`: `teacherId` is optional. Backend can auto-assign matching teacher.
- S3 upload support:
  - Set `USE_S3=true` and configure:
    - `AWS_REGION`
    - `AWS_S3_BUCKET`
    - `AWS_ACCESS_KEY_ID`
    - `AWS_SECRET_ACCESS_KEY`
  - Install deps:
    - `@aws-sdk/client-s3`
    - `multer-s3`
  - If `USE_S3` is false, uploads continue to local `/uploads`.

---

## 8) Demo Payloads For All POST APIs (Postman Ready)

Base prefix for all routes below: `{{base_url}}/api/v1`

### Auth

`POST /auth/register` (student)
```json
{
  "role": "student",
  "name": "Fatima Ahmed",
  "phone": "24587569",
  "pin": "1234",
  "confirmPin": "1234",
  "gradeId": "{{grade_id}}",
  "assignedSubjectIds": ["{{subject_id}}"]
}
```

`POST /auth/register` (teacher)
```json
{
  "role": "teacher",
  "name": "Mohammed Ould",
  "phone": "34587569",
  "pin": "1234",
  "confirmPin": "1234",
  "subjectId": "{{subject_id}}",
  "assignedGradeIds": ["{{grade_id}}"]
}
```

`POST /auth/login`
```json
{
  "phone": "24587569",
  "pin": "1234"
}
```

`POST /otp/send`
```json
{
  "phone": "33445566"
}
```

`POST /otp/verify`
```json
{
  "phone": "33445566",
  "otp": "4821"
}
```

`POST /otp/resend`
```json
{
  "phone": "33445566"
}
```

`GET /sms/statistics`

### Users

`POST /users` (admin create user)
```json
{
  "role": "student",
  "name": "Mariam Ould",
  "phone": "24567890",
  "pin": "1234",
  "gradeId": "{{grade_id}}",
  "assignedSubjectIds": ["{{subject_id}}"]
}
```

### Classes

`POST /classes` (admin)
```json
{
  "subjectId": "{{subject_id}}",
  "gradeId": "{{grade_id}}",
  "teacherId": "{{teacher_id}}",
  "maxStudents": 30,
  "status": "active",
  "schedule": [
    { "day": "mon", "startMin": 540, "endMin": 600 },
    { "day": "wed", "startMin": 540, "endMin": 600 }
  ]
}
```

### Lessons

`POST /lesson` (`multipart/form-data`, teacher/admin)

Form-data keys:
- `title`: `Introduction to Algebra`
- `description`: `Basic algebra concepts`
- `contentType`: `text` or `pdf`
- `chapter`: `Chapter 1`
- `status`: `published`
- `gradeId`: `{{grade_id}}`
- `subjectId`: `{{subject_id}}`
- `classId`: `{{class_id}}` (optional)
- `date`: `2026-02-24` (optional)
- `files`: upload file(s), required if `contentType=pdf`

### Assignments

`POST /assignments` (`multipart/form-data`, teacher)

Form-data keys:
- `title`: `Quadratic Equations Worksheet`
- `description`: `Solve problems 1-20`
- `dueDate`: `2026-02-27`
- `dueTime`: `10:00`
- `points`: `100`
- `gradeId`: `{{grade_id}}`
- `subjectId`: `{{subject_id}}`
- `classId`: `{{class_id}}` (optional)
- `file`: upload file (optional)

### Sessions

`POST /sessions` (teacher create live session)
```json
{
  "title": "Mathematics Q&A Session",
  "gradeId": "{{grade_id}}",
  "subjectId": "{{subject_id}}",
  "classId": "{{class_id}}",
  "className": "5th Grade - Math A",
  "date": "2026-02-25",
  "time": "10:00",
  "duration": 60,
  "zoomLink": "https://zoom.us/j/12345678901"
}
```

`POST /sessions/:id/join` (student)
```json
{}
```

### Submissions

`POST /submission/:assignmentId/submit` (`multipart/form-data`, student)

Form-data keys:
- `file`: upload file (optional)
- `textAnswer`: `My written response...` (optional)

### Profiles

`POST /profiles` (`multipart/form-data`, auth user)
```json
{
  "email": "fatima@gmail.com",
  "address": "Nouadhibou, Mauritania",
  "studentInfo": {
    "parentName": "Ahmed Hassan",
    "parentPhone": "45678902",
    "parentEmail": "parent@gmail.com"
  }
}
```

`POST /profiles/:userId` (`multipart/form-data`, admin)
```json
{
  "email": "teacher@gmail.com",
  "address": "Nouakchott, Mauritania",
  "teacherInfo": {
    "department": "Science",
    "qualifications": "BSc Physics",
    "officeHours": "Mon-Wed 10:00-12:00",
    "bio": "Physics teacher"
  }
}
```

### Attendance

`POST /attendance/classes/:classId` (teacher/admin)
```json
{
  "date": "2026-02-24",
  "records": [
    { "studentId": "{{student_id_1}}", "status": "Present", "notes": "On time" },
    { "studentId": "{{student_id_2}}", "status": "Late", "notes": "10 min late" }
  ]
}
```

### Teacher

`POST /teachers/students/:studentId/attendance` (teacher)
```json
{
  "classId": "{{class_id}}",
  "status": "Present",
  "date": "2026-02-24"
}
```

### Subjects

`POST /subjects` (admin)
```json
{
  "name": "Mathematics",
  "code": "MATH",
  "description": "Mathematics subject",
  "color": "#1f3c88"
}
```

### Grades

`POST /grades` (admin)
```json
{
  "label": "5th"
}
```

### Admin - Users

`POST /admin/users`
```json
{
  "role": "teacher",
  "name": "John Smith",
  "phone": "39876543",
  "pin": "1234",
  "subjectId": "{{subject_id}}",
  "assignedGradeIds": ["{{grade_id}}"]
}
```

### Admin - Classes

`POST /admin/classes` (teacherId optional)
```json
{
  "subjectId": "{{subject_id}}",
  "gradeId": "{{grade_id}}",
  "teacherId": "{{teacher_id}}",
  "students": ["{{student_id_1}}", "{{student_id_2}}"],
  "maxStudents": 35,
  "status": "active",
  "schedule": [
    { "day": "mon", "startMin": 540, "endMin": 600 }
  ]
}
```

### Admin - Assignments

`POST /admin/assignments` (`multipart/form-data`)

Form-data keys:
- `classId`: `{{class_id}}`
- `title`: `Chapter 5 Homework`
- `description`: `Complete all exercises`
- `dueDate`: `2026-02-28`
- `dueTime`: `12:00`
- `points`: `100`
- `status`: `active`
- `lateAllowed`: `true`
- `files`: upload file(s) optional

### Admin - Live Sessions

`POST /admin/live-sessions`
```json
{
  "teacherId": "{{teacher_id}}",
  "title": "Algebra Live Session",
  "gradeId": "{{grade_id}}",
  "subjectId": "{{subject_id}}",
  "classId": "{{class_id}}",
  "className": "5th Grade - Math A",
  "date": "2026-02-26",
  "time": "09:00",
  "duration": 60,
  "zoomLink": "https://zoom.us/j/12345678901"
}
```

### Admin - Timetable

`POST /admin/timetable/entries`
```json
{
  "type": "class",
  "gradeId": "{{grade_id}}",
  "section": "A",
  "subjectId": "{{subject_id}}",
  "teacherId": "{{teacher_id}}",
  "classId": "{{class_id}}",
  "room": "Room 101",
  "day": "mon",
  "startMin": 540,
  "endMin": 600,
  "isActive": true
}
```

### Admin - Notifications

`POST /admin/notifications`
```json
{
  "title": "Exam Schedule Update",
  "message": "Midterm exams start next week.",
  "channel": "announcement",
  "priority": "high",
  "targetType": "roles",
  "target": {
    "roles": ["student", "teacher"]
  },
  "action": "send_now"
}
```
