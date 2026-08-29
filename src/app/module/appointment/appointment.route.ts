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

router.patch(
	"/update-status/:appointmentId",
	auth(Role.DOCTOR),
	appointmentControllers.updateAppointmentStatus,
);

router.get(
	"/my-appointments",
	auth(Role.PATIENT),
	appointmentControllers.getMyAppointment,
);

router.get(
	"/doctor-appointments",
	auth(Role.DOCTOR),
	appointmentControllers.getDoctorAppointments,
);

router.get(
	"/all-appointments",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	appointmentControllers.getAllAppointments,
);

router.get(
	"/:appointmentId",
	auth(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
	appointmentControllers.getSingleAppointment,
);

export const appointmentRoutes = router;
