import httpStatus from "http-status";
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { paymentServices } from "./payment.service";
import { sendResponse } from "../../utils/sendResponse";

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;

	const { data, meta } = await paymentServices.getMyPayments(req.query, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payments Retrieved Successfully",
		data,
		meta,
	});
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await paymentServices.getAllPayments(req.query);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payments Retrieved Successfully",
		data,
		meta,
	});
});

const getSinglePayment = catchAsync(async (req: Request, res: Response) => {
	const paymentId = req.params.paymentId as string;
	const user = req.user!;

	const result = await paymentServices.singlePayment(paymentId, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payment Retrieved Successfully",
		data: result,
	});
});

export const paymentController = {
	getMyPayments,
	getAllPayments,
	getSinglePayment,
};
