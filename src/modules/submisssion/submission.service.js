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

// Returns the latest submission for (assignment, student), or null.
const findLatestSubmission = (assignmentId, studentId) =>
  Submission.findOne({ assignmentId, studentId })
    .sort({ submittedAt: -1, createdAt: -1 })
    .lean();

// Returns true if the student already has a graded submission for this assignment.
const hasGradedSubmission = async (assignmentId, studentId) => {
  const graded = await Submission.exists({
    assignmentId,
    studentId,
    status: "graded",
  });
  return !!graded;
};

// Compute whether the student is allowed to resubmit right now.
const computeCanResubmit = ({ assignment, latestSubmission }) => {
  if (!assignment) return false;
  if (assignment.status === "closed") return false;

  if (latestSubmission?.status === "graded") return false;

  if (assignment.dueAt) {
    const isLate = new Date() > new Date(assignment.dueAt);
    if (isLate && !assignment.lateAllowed) return false;
  }

  return true;
};

export const submitAssignment = async ({ assignmentId, studentId, file, textAnswer }) => {
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) throw new AppError("Assignment not found", 404);
  if (assignment.status === "closed") throw new AppError("Assignment is closed", 400);

  await assertStudentCanAccessAssignment(assignment, studentId);

  // Once the teacher has graded any prior submission, the student cannot
  // resubmit. Resubmission is only allowed while the latest submission is
  // still pending/submitted (not graded).
  if (await hasGradedSubmission(assignmentId, studentId)) {
    throw new AppError(
      "Your submission has already been graded by the teacher and cannot be resubmitted",
      400
    );
  }

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

  const latestSubmission = await findLatestSubmission(assignmentId, studentId);
  const isGraded = latestSubmission?.status === "graded";
  const canResubmit = computeCanResubmit({ assignment, latestSubmission });

  return {
    submission: latestSubmission,
    isGraded,
    canResubmit,
    assignmentStatus: assignment.status,
    dueAt: assignment.dueAt || null,
    lateAllowed: !!assignment.lateAllowed,
  };
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
