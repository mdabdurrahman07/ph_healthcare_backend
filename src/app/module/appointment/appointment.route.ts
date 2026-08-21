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
router.get(
	"/book-appointment/payment/callback",
	appointmentControllers.bookingCallBack,
);

export const appointmentRoutes = router;
