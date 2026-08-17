import { Router } from "express";
import { appointmentControllers } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../../generated/enums";

const router = Router();

router.post("/book-appointment", auth(Role.ADMIN, Role.PATIENT, Role.SUPER_ADMIN), appointmentControllers.bookAppointments)

export const appointmentRoutes = router;
