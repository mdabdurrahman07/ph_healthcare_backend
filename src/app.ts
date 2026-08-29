import { PrescriptionRoutes } from "./app/module/prescription/prescription.route";
import cors from "cors";
import cookieParser from "cookie-parser";
import express, {
	type Application,
	type Request,
	type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { userRoutes } from "./app/module/user/user.route";
import { appointmentRoutes } from "./app/module/appointment/appointment.route";
import { doctorRoutes } from "./app/module/doctor/doctor.route";
import { scheduleRoutes } from "./app/module/schedule/schedule.route";
import { paymentRoutes } from "./app/module/payment/payment.route";
import { analyticsRoutes } from "./app/module/analytic/analytic.route";

const app: Application = express();

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

// ? Auth routes
app.use("/api/v1/auth", AuthRoutes);
// ? User routes
app.use("/api/v1/user", userRoutes);
// ? Appointments routes
app.use("/api/v1/appointment", appointmentRoutes);
// ? Doctors routes
app.use("/api/v1/doctor", doctorRoutes);
// ? Schedule routes
app.use("/api/v1/schedule", scheduleRoutes);
// ? Payment routes
app.use("/api/v1/payment", paymentRoutes);
// ? Prescription routes
app.use("/api/v1/prescription", PrescriptionRoutes);
// ? Analytics Routes
app.use("api/v1/analytic", analyticsRoutes);
// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to PH Healthcare System Backend",
	});
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
