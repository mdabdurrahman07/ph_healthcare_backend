import { Router } from "express";
import { userControllers } from "./user.controller";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../../generated/enums";

const router = Router();

router.patch("/profile-image", auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN) , upload.single("profileImage") ,userControllers.uploadProfileImageController);

export const userRoutes = router;
