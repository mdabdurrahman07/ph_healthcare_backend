import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
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
		const result = await doctorServices.applyAsDoctorService(data, resume, additionalFiles);
		sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Applied as Doctor successfully",
			data: result,
		});
	},
);

export const doctorControllers = {
	applyAsDoctorController,
};
