
import { catchAsync } from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import * as userService from '../user/user.service.js'

export const getUsers = catchAsync(async(req , res)=>{
  const user = await userService.getUsers(req.query)
  return sendResponse(res, {
    statusCode: 200,
    message:"user fetched",
    data: user
  })
})
export const getUsersById = catchAsync(async(req, res)=>{
  const user = await userService.getUsersById(req.params.id)
  return sendResponse(res, {
    statusCode: 200,
    message:"user fetched by id",
    data: user
  })
})

export const getMe = catchAsync(async (req, res) => {
  const user = await userService.getUsersById(req.user._id);
  return sendResponse(res, {
    statusCode: 200,
    message: "user fetched by token",
    data: user,
  });
});
export const updatedUsers = catchAsync(async(req, res)=>{
  const user = await userService.updateUser(req.params.id , req.body)
  return sendResponse(res, {
    statusCode: 200,
    message: "user updated",
    data: user
  })
})
 export const deleteUser = catchAsync(async(req, res)=>{
  const user = await userService.deleteUser(req.params.id)
  return sendResponse(res, {
    statusCode: 200,
    message: "user deleted",
    data: user
  })
 })
 

export const createUserByAdmin = catchAsync(async (req, res) => {
  const user = await userService.adminCreateUser({
    ...req.body,
    createdBy: req.user?._id || null,
  });
  return sendResponse(res, { statusCode: 201, message: "User created", data: user });
});

export const updateStudentAssignedSubjects = catchAsync(async (req, res) => {
  const user = await userService.updateStudentAssignedSubjects(
    req.params.id,
    req.body?.assignedSubjects
  );

  return sendResponse(res, {
    statusCode: 200,
    message: "Student assigned subjects updated",
    data: user,
  });
});


