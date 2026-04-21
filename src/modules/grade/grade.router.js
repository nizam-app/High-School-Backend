import { Router } from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import * as gradeController from "./grade.controller.js";

const router = Router();
// get all grades
router.get("/", requireAuth, gradeController.listGrades);
// get one grades
router.get("/:id", requireAuth, gradeController.getGradeById);
// admin create grades
router.post("/", requireAuth, restrictTo("admin"), gradeController.createGrade);
// admin uodate grade 
router.patch("/:id", requireAuth, restrictTo("admin"), gradeController.updateGrade);
// admin delete garde
router.delete("/:id", requireAuth, restrictTo("admin"), gradeController.deleteGrade);

export default router;
