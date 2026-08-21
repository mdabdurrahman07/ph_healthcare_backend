import httpStatus from "http-status";
import { Request, Response } from "express";
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

export const appointmentControllers = {
  bookAppointments,
  bookingCallBack,
  payAppointment,
  cancelAppointment
};
