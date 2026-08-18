import httpStatus from "http-status";
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { appointmentsServices } from "./appointment.service";
import { sendResponse } from "../../utils/sendResponse";

const bookAppointments = catchAsync(async (req: Request, res: Response) => {
	const result = await appointmentsServices.createNewBooking();

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Booking Confirmed",
		data: result,
	});
});

const bookingCallBack = catchAsync(async (req: Request, res: Response) => {
  const result = appointmentsServices.bookingAppointmentCallback()
  	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Booking CallBack",
		data: result,
	});
})

export const appointmentControllers = {
	bookAppointments,
  bookingCallBack
};
