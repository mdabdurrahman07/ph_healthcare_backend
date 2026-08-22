import { Router } from "express";
import { doctorControllers } from "./doctor.controller";

const router = Router();

router.post("/apply_as_doctor", doctorControllers.applyAsDoctorController)

export const doctorRoutes = router;
