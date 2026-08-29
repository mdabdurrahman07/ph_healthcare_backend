import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../../generated/enums";
import { scheduleController } from "./schedule.controller";

const router = Router();

router.post(
	"/create-schedule",
	auth(Role.DOCTOR),
	scheduleController.createSchedule,
);

router.get(
	"/my-schedules",
	auth(Role.DOCTOR),
	scheduleController.getMySchedules,
);

router.get(
	"/all-schedules",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	scheduleController.getAllSchedules,
);

router.get("/todays-schedule", scheduleController.getTodaysSchedules);

router.patch(
	"/update-schedule/:scheduleId",
	auth(Role.DOCTOR),
	scheduleController.updateSchedule,
);

router.patch(
	"/publish-schedule/:scheduleId",
	auth(Role.DOCTOR),
	scheduleController.publishSchedule,
);

router.get(
	"/:scheduleId",
	auth(Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
	scheduleController.getScheduleById,
);

router.delete(
	"/:scheduleId",
	auth(Role.DOCTOR),
	scheduleController.deleteSchedule,
);

export const scheduleRoutes = router;
