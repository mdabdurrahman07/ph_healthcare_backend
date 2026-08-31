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
router.get(
	"/all-doctors",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	doctorControllers.getAllDoctors,
);
router.patch(
	"/update-my-profile",
	auth(Role.DOCTOR),
	doctorControllers.updateDoctorProfile,
);

// Public doctor-discovery routes (no auth) — meant for patients browsing before login.
router.get(
	"/public/available-today",
	doctorControllers.getAvailableDoctorByTodaysSchedule,
);

router.get(
	"/public/all-doctors",
	doctorControllers.getAllDoctorsListPublic,
);

router.get(
	"/public/:doctorId",
	doctorControllers.getSingleDoctorPublicProfile,
);

export const doctorRoutes = router;
