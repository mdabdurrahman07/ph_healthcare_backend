import { Router } from "express";
import { doctorControllers } from "./doctor.controller";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../../generated/enums";

const router = Router();

router.post(
	"/apply_as_doctor",
	upload.fields([
		{
			name: "resume",
			maxCount: 1,
		},
		{
			name: "additionalFiles",
			maxCount: 10,
		},
	]),
	doctorControllers.applyAsDoctorController,
);

router.post("apply_as_doctor/verifyEmail", doctorControllers.verifyDoctorEmail);
router.post("approve-doctor", auth(Role.ADMIN, Role.SUPER_ADMIN));

export const doctorRoutes = router;
