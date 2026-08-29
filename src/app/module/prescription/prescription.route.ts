import { Router } from "express";
import { Role } from "../../../../generated/enums";
import { auth } from "../../middleware/checkAuth";
import { prescriptionController } from "./prescription.controller";

const router = Router();

router.post(
	"/create-prescription",
	auth(Role.DOCTOR),
	prescriptionController.createPrescription,
);

router.get(
	"/:appointmentId",
	auth(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
	prescriptionController.getSinglePrescription,
);

export const PrescriptionRoutes = router;
