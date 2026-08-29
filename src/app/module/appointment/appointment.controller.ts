import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { appointmentsServices } from "./appointment.service";
import { sendResponse } from "../../utils/sendResponse";

const bookAppointments = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user;
	const result = await appointmentsServices.createNewBooking(payload, user!);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Booking Confirmed",
		data: result,
	});
});

const payAppointment = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await appointmentsServices.payAppointment(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payment URL",
		data: result,
	});
});
const cancelAppointment = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await appointmentsServices.cancelAppointment(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointment is Cancelled and payment refunded",
		data: result,
	});
});

const bookingCallBack = catchAsync(async (req: Request, res: Response) => {
	const { redirectUrl } = await appointmentsServices.bookingAppointmentCallback(
		req.query,
	);
	res.redirect(redirectUrl);
});

const updateAppointmentStatus = catchAsync(
	async (req: Request, res: Response) => {
		const appointmentId = req.params.appointmentId as string;
		const payload = req.body;
		const user = req.user!;

		const result = await appointmentsServices.updateAppointment(
			appointmentId,
			payload,
			user,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Appointment Status Updated Successfully",
			data: result,
		});
	},
);

const getMyAppointment = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;

	const { data, meta } = await appointmentsServices.getMyAppointment(
		req.query,
		user,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointments Retrieved Successfully",
		data,
		meta,
	});
});
const getDoctorAppointments = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user!;

		const { data, meta } = await appointmentsServices.getDoctorAppointments(
			req.query,
			user,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Appointments Retrieved Successfully",
			data,
			meta,
		});
	},
);
const getAllAppointments = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await appointmentsServices.getAllAppointments(
		req.query,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointments Retrieved Successfully",
		data,
		meta,
	});
});
const getSingleAppointment = catchAsync(async (req: Request, res: Response) => {
	const appointmentId = req.params.appointmentId as string;
	const user = req.user!;

	const result = await appointmentsServices.getSingleAppointment(
		appointmentId,
		user,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointment Retrieved Successfully",
		data: result,
	});
});

export const appointmentControllers = {
	bookAppointments,
	bookingCallBack,
	payAppointment,
	cancelAppointment,
	getMyAppointment,
	getDoctorAppointments,
	getAllAppointments,
	getSingleAppointment,
	updateAppointmentStatus,
};
