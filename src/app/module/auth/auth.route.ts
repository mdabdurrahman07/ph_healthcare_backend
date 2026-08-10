import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";
import { Role } from "../../../../generated/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { patientRegistrationSchema } from "../../utils/zodSchemas/patientRegistrationSchema";

const router = Router();

router.post("/register", validateRequest(patientRegistrationSchema), AuthController.registerPatient);
router.post("/login", AuthController.loginUser);
router.get(
	"/me",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/google", AuthController.googleService);
export const AuthRoutes = router;
