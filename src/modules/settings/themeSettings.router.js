import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import {
  allowThemeSettingsWrite,
  validateFullThemeRequest,
  validateThemeDarkRequest,
  validateThemeLightRequest,
  validateThemeModeRequest,
  validateThemeTypographyRequest,
} from "./themeSettings.middleware.js";
import {
  getThemeSettings,
  patchThemeDark,
  patchThemeLight,
  patchThemeMode,
  patchThemeTypography,
  putThemeSettings,
  resetThemeSettings,
} from "./themeSettings.controller.js";

const router = Router();

router.get("/", requireAuth, getThemeSettings);
router.put("/", requireAuth, allowThemeSettingsWrite, validateFullThemeRequest, putThemeSettings);
router.patch(
  "/mode",
  requireAuth,
  allowThemeSettingsWrite,
  validateThemeModeRequest,
  patchThemeMode
);
router.patch(
  "/light",
  requireAuth,
  allowThemeSettingsWrite,
  validateThemeLightRequest,
  patchThemeLight
);
router.patch(
  "/dark",
  requireAuth,
  allowThemeSettingsWrite,
  validateThemeDarkRequest,
  patchThemeDark
);
router.patch(
  "/typography",
  requireAuth,
  allowThemeSettingsWrite,
  validateThemeTypographyRequest,
  patchThemeTypography
);
router.post("/reset", requireAuth, allowThemeSettingsWrite, resetThemeSettings);

export default router;
