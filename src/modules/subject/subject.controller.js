import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as subjectService from "./subject.service.js";

export const createSubject = catchAsync(async (req, res) => {
  const data = await subjectService.createSubject(req.body, req.user?._id || null);
  return sendResponse(res, {
    statusCode: 201,
    message: "Subject created",
    data,
  });
});

export const listSubjects = catchAsync(async (req, res) => {
  const data = await subjectService.listSubjects(req.query);
  return sendResponse(res, {
    statusCode: 200,
    message: "Subjects fetched",
    data,
  });
});

export const listAllSubjectsBasic = catchAsync(async (_req, res) => {
  const data = await subjectService.listAllSubjectsBasic();
  return sendResponse(res, {
    statusCode: 200,
    message: "All subjects fetched",
    data,
  });
});

export const getSubjectById = catchAsync(async (req, res) => {
  const data = await subjectService.getSubjectById(req.params.id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Subject fetched",
    data,
  });
});

export const updateSubject = catchAsync(async (req, res) => {
  const data = await subjectService.updateSubject(req.params.id, req.body, req.user?._id || null);
  return sendResponse(res, {
    statusCode: 200,
    message: "Subject updated",
    data,
  });
});

export const deleteSubject = catchAsync(async (req, res) => {
  const data = await subjectService.deleteSubject(req.params.id);
  return sendResponse(res, {
    statusCode: 200,
    message: "Subject deleted",
    data,
  });
});
