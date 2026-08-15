import { Router } from "express";
import { userControllers } from "./user.controller";
import { upload } from "../../lib/multer";

const router = Router();

router.patch("/profile-image", upload.single("profileImage") ,userControllers.uploadProfileImageController);

export const userRoutes = router;
