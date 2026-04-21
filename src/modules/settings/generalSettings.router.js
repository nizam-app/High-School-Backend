import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import {
  allowGeneralSettingsWrite,
  validateGeneralSettingsRequest,
} from "./generalSettings.middleware.js";
import {
  getGeneralSettings,
  updateGeneralSettings,
} from "./generalSettings.controller.js";

const router = Router();

router.get("/general", requireAuth, getGeneralSettings);
router.put(
  "/general",
  requireAuth,
  allowGeneralSettingsWrite,
  validateGeneralSettingsRequest,
  updateGeneralSettings
);

export default router;
