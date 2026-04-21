import { Router } from "express";
import { requireAuth, restrictTo } from "../../middlewares/auth.js";
import * as profileController from "./profile.controller.js";
import { makeImageUploader } from "../../middlewares/upload.js";

const router = Router();
const uploadProfileImage = makeImageUploader("profiles");

router.get("/me", requireAuth, profileController.getMyProfile);
router.patch(
  "/me",
  requireAuth,
  uploadProfileImage.single("profileImage"),
  profileController.updateMyProfile
);

router.get("/", requireAuth, restrictTo("admin"), profileController.getAllProfiles);
router.get("/:id", requireAuth, restrictTo("admin"), profileController.getProfileById);
router.patch(
  "/:id",
  requireAuth,
  restrictTo("admin"),
  uploadProfileImage.single("profileImage"),
  profileController.updateProfileById
);
router.delete("/:id", requireAuth, restrictTo("admin"), profileController.deleteProfileById);

export default router;
