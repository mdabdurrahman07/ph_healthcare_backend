import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../../generated/enums";
import { paymentController } from "./payment.controller";

const router = Router();

router.get("/my-payments", auth(Role.PATIENT), paymentController.getMyPayments);

router.get(
	"/all-payments",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	paymentController.getAllPayments,
);

router.get(
	"/:paymentId",
	auth(Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),
	paymentController.getSinglePayment,
);

export const paymentRoutes = router;
