import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { prescriptionServices } from "./prescription.service";
import { Request, Response } from "express";

const createPrescription = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await prescriptionServices.createPrescription(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Prescription Created And Emailed To Patient Successfully",
		data: result,
	});
});

const getSinglePrescription = catchAsync(
	async (req: Request, res: Response) => {
		const appointmentId = req.params.appointmentId as string;
		const user = req.user!;

		const result = await prescriptionServices.getSinglePrescription(
			appointmentId,
			user,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Prescription Retrieved Successfully",
			data: result,
		});
	},
);

export const prescriptionController = {
	createPrescription,
	getSinglePrescription,
};
