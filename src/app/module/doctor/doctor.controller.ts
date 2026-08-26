import { catchAsync } from "./../../utils/catchAsync";
import type { Request, Response } from "express";
import httpStatus from "http-status";
import { sendResponse } from "../../utils/sendResponse";
import { doctorServices } from "./doctor.service";

const applyAsDoctorController = catchAsync(
	async (req: Request, res: Response) => {
		const files = req.files as { [fieldname: string]: Express.Multer.File[] };
		const resume = files?.["resume"] ? files["resume"][0] : null;
		const additionalFiles = files?.["additionalFiles"] || [];
		const data = JSON.parse(req.body.data);
		if (!resume) {
			throw new Error("Resume file is required");
		}
		const result = await doctorServices.applyAsDoctorService(
			data,
			resume,
			additionalFiles,
		);
		sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Applied as Doctor successfully",
			data: result,
		});
	},
);

const verifyDoctorEmail = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	const result = await doctorServices.verifyDoctorEmail(payload);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Doctor verification successful",
		data: result,
	});
});

const verifyDoctor = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await doctorServices.approveDoctor(payload, user);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Email Verified",
		data: result,
	});
});

const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await doctorServices.getAllDoctors(req.query);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "All Doctors Data Retrieved Successfully",
		data: data,
		meta: meta,
	});
});

export const doctorControllers = {
	applyAsDoctorController,
	verifyDoctorEmail,
	verifyDoctor,
	getAllDoctors,
};
