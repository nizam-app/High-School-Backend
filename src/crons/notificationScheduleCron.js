import {
  startNotificationScheduleCron as startNotificationScheduleCronService,
  stopNotificationScheduleCron,
} from "../modules/notification/notification.service.js";

export const startNotificationScheduleCron = () => {
  startNotificationScheduleCronService();
};

export { stopNotificationScheduleCron };
