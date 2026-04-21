import { Router } from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import * as subjectController from "./subject.controller.js";

const router = Router();

router.get("/", requireAuth, subjectController.listSubjects);
router.get("/all", subjectController.listAllSubjectsBasic);
router.get("/:id", requireAuth, subjectController.getSubjectById);

router.post("/", requireAuth, restrictTo("admin"), subjectController.createSubject);
router.patch("/:id", requireAuth, restrictTo("admin"), subjectController.updateSubject);
router.delete("/:id", requireAuth, restrictTo("admin"), subjectController.deleteSubject);

export default router;
