import { Router } from "express";
import { appointmentControllers } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../../generated/enums";

const router = Router();

router.post(
	"/book-appointment",
	auth(Role.PATIENT),
	appointmentControllers.bookAppointments,
);
router.post(
	"/pay-appointment",
	auth(Role.PATIENT),
	appointmentControllers.payAppointment,
);
router.post(
	"/cancel-appointment",
	auth(Role.PATIENT),
	appointmentControllers.cancelAppointment,
);
router.get(
	"/book-appointment/payment/callback",
	appointmentControllers.bookingCallBack,
);

export const appointmentRoutes = router;
