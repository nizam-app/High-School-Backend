
import { Router } from "express";
import * as userController from "../user/user.controller.js"
import { requireAuth } from "../../middlewares/auth.js";
import { restrictTo } from "../../middlewares/auth.js";
const router = Router()
// router.post('/', userController.createUsers)
router.post("/", requireAuth, restrictTo("admin"), userController.createUserByAdmin);
router.get('/me', requireAuth, userController.getMe)
router.get('/', requireAuth, restrictTo("admin"), userController.getUsers)
router.get('/:id', requireAuth, restrictTo("admin"), userController.getUsersById)
router.patch(
  '/:id/assigned-subjects',
  requireAuth,
  restrictTo("admin"),
  userController.updateStudentAssignedSubjects
)
router.patch('/:id', requireAuth, restrictTo("admin"), userController.updatedUsers)
router.delete('/:id', requireAuth, restrictTo("admin"), userController.deleteUser)


export default router
