import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import { getMyNotifications, getUnreadCount, markAsRead } from "./notification.controller.js";

const router = Router();

router.get("/me", requireAuth, getMyNotifications);
router.get("/me/unread-count", requireAuth, getUnreadCount);
router.patch("/:id/read", requireAuth, markAsRead);

export default router;
