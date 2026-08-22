import { Router } from "express";
import { doctorControllers } from "./doctor.controller";
import { upload } from "../../lib/multer";

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

export const doctorRoutes = router;
