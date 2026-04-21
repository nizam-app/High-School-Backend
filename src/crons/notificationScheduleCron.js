import { startNotificationScheduleCron as startNotificationScheduleCronService } from "../modules/notification/notification.service.js";

export const startNotificationScheduleCron = () => {
  startNotificationScheduleCronService();
};
