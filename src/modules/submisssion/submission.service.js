import AppError from "../../utils/AppError.js";
import { Submission } from "./submission.model.js";
import { Assignment } from "../assignment/assignment.model.js";
import {
  buildStudentAssignmentFilter,
  buildStudentClassScopeContext,
  studentCanAccessAssignment,
} from "../../utils/studentClassAccess.js";
import { buildStoredFileMeta } from "../../utils/fileStorage.js";

const assertStudentCanAccessAssignment = async (assignment, studentId) => {
  const context = await buildStudentClassScopeContext(null, studentId);
  if (!context.studentDoc) throw new AppError("Student not found", 404);
  if (!studentCanAccessAssignment(assignment, context)) {
    throw new AppError("This assignment is not available for your class", 403);
  }
};

export const submitAssignment = async ({ assignmentId, studentId, file, textAnswer }) => {
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) throw new AppError("Assignment not found", 404);
  if (assignment.status === "closed") throw new AppError("Assignment is closed", 400);

  await assertStudentCanAccessAssignment(assignment, studentId);

  // late rules
  const now = new Date();
  if (assignment.dueAt) {
    const isLate = now > new Date(assignment.dueAt);
    if (isLate && !assignment.lateAllowed) throw new AppError("Late submission is not allowed", 400);
  }

  const hasFile = !!file;
  const hasText = !!(textAnswer && String(textAnswer).trim());

  if (!hasFile && !hasText) throw new AppError("Upload a file or write a submission", 400);

  // optional strict: only allow pdf
  if (hasFile && file.mimetype !== "application/pdf") {
    throw new AppError("Only PDF file is allowed", 400);
  }

  // Create a new row for each submit attempt.
  const submissionPayload = {
    assignmentId,
    studentId,
    submittedAt: now,
    status: "submitted",
  };

  if (hasFile) {
    const stored = buildStoredFileMeta(file, "submissions");
    submissionPayload.submissionType = "file";
    submissionPayload.file = {
      originalName: stored?.originalName || file.originalname,
      mimeType: stored?.mimeType || file.mimetype,
      size: stored?.size || file.size,
      storageKey: stored?.storageKey || file.filename || null,
      url: stored?.url || null,
    };
  } else {
    submissionPayload.submissionType = "text";
    submissionPayload.textAnswer = String(textAnswer).trim();
  }

  const submission = await Submission.create(submissionPayload);
  await Assignment.findByIdAndUpdate(assignmentId, {
    $push: { submissions: submission._id },
  });

  return submission;
};

export const gradeSubmission = async ({ submissionId, graderId, score, feedback }) => {
  const sub = await Submission.findById(submissionId)
    .populate("assignmentId", "createdBy points")
    .lean();

  if (!sub) throw new AppError("Submission not found", 404);

  if (String(sub.assignmentId.createdBy) !== String(graderId)) {
    throw new AppError("Only the teacher who created this assignment can grade it", 403);
  }

  const scoreNum = Number(score);
  if (!Number.isFinite(scoreNum) || scoreNum < 0) {
    throw new AppError("Valid score is required", 400);
  }

  // IMPORTANT: score must be <= assignment points
  const maxPoints = Number(sub.assignmentId.points);
  if (Number.isFinite(maxPoints) && scoreNum > maxPoints) {
    throw new AppError(`Score cannot be greater than ${maxPoints}`, 400);
  }

  const updated = await Submission.findByIdAndUpdate(
    submissionId,
    {
      $set: {
        status: "graded",
        grade: {
          score: scoreNum,
          feedback: feedback ? String(feedback).trim() : "",
          gradedBy: graderId,
          gradedAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true }
  );

  return updated;
};

// Student view my submission (grade + feedback)
export const getMySubmission = async ({ assignmentId, studentId }) => {
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) throw new AppError("Assignment not found", 404);
  await assertStudentCanAccessAssignment(assignment, studentId);

  return Submission.findOne({ assignmentId, studentId }).sort({ submittedAt: -1 }).lean();
};

export const getMyPendingSubmissions = async ({ studentId }) => {
  const assignmentFilter = await buildStudentAssignmentFilter(null, studentId);
  if (assignmentFilter._id === null) return [];

  const inScopeAssignments = await Assignment.find(assignmentFilter).select("_id").lean();
  const assignmentIds = inScopeAssignments.map((a) => a._id);
  if (!assignmentIds.length) return [];

  return Submission.find({ studentId, status: "pending", assignmentId: { $in: assignmentIds } })
    .populate("assignmentId", "_id title dueAt points gradeId subjectId classId")
    .sort({ submittedAt: -1, createdAt: -1 })
    .lean();
};
