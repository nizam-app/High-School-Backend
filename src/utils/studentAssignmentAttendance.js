export const isGradedStudentSubmission = (submission) => {
  if (!submission) return false;
  const normalizedStatus = String(submission.status || "").trim().toLowerCase();
  return normalizedStatus === "graded" || Boolean(submission?.grade?.gradedAt);
};

/**
 * attendancePercentage = (gradedSubmittedAssignments / totalAssignedAssignments) * 100
 * A graded submission counts as attended/completed for that assignment.
 */
export const calculateStudentAssignmentAttendance = (assignments, latestSubmissionByAssignmentId) => {
  const totalAssignedAssignments = Array.isArray(assignments) ? assignments.length : 0;
  let gradedSubmittedAssignments = 0;

  for (const assignment of assignments) {
    const submission = latestSubmissionByAssignmentId.get(String(assignment._id));
    if (isGradedStudentSubmission(submission)) {
      gradedSubmittedAssignments += 1;
    }
  }

  const attendancePercentage =
    totalAssignedAssignments > 0
      ? Math.round((gradedSubmittedAssignments / totalAssignedAssignments) * 100)
      : 0;

  return {
    attendancePercentage,
    gradedSubmittedAssignments,
    totalAssignedAssignments,
  };
};

export const pickLatestSubmissionPerAssignment = (submissions = []) => {
  const latestMap = new Map();
  for (const submission of submissions) {
    const key = String(submission.assignmentId);
    const existing = latestMap.get(key);
    const submittedAt = new Date(submission.submittedAt || submission.createdAt || 0);
    const existingAt = existing
      ? new Date(existing.submittedAt || existing.createdAt || 0)
      : null;
    if (!existing || submittedAt > existingAt) {
      latestMap.set(key, submission);
    }
  }
  return latestMap;
};
