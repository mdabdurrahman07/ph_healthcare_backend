import { catchAsync } from "./../../utils/catchAsync";
import type { Request, Response } from "express";
import httpStatus from "http-status";
import { sendResponse } from "../../utils/sendResponse";
import { doctorServices } from "./doctor.service";
import { AppError } from "../../utils/AppError";

const applyAsDoctorController = catchAsync(
	async (req: Request, res: Response) => {
		const files = req.files as { [fieldname: string]: Express.Multer.File[] };
		const resume = files?.["resume"] ? files["resume"][0] : null;
		const additionalFiles = files?.["additionalFiles"] || [];
		const data = JSON.parse(req.body.data);
		if (!resume) {
			throw new AppError(httpStatus.BAD_REQUEST, "Resume file is required");
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

const updateDoctorProfile = catchAsync(
	async (req: Request, res: Response) => {
		const payload = req.body;
		const user = req.user!;

		const result = await doctorServices.updateDoctorProfile(payload, user);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor Profile Updated Successfully",
			data: result,
		});
	},
);

const getAvailableDoctorByTodaysSchedule = catchAsync(
	async (req: Request, res: Response) => {
	

		const {data, meta} = await doctorServices.getAvailableDoctorByTodaysSchedule(req.query)
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Today's Available Doctors Retrieved Successfully",
			data,
			meta,
		});
	},
);

const getAllDoctorsListPublic = catchAsync(async (req: Request, res: Response) => {


	const { data, meta } = await doctorServices.getAllDoctorsListPublic(
		req.query
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctors Retrieved Successfully",
		data,
		meta,
	});
});

const getSingleDoctorPublicProfile = catchAsync(
	async (req: Request, res: Response) => {

		const doctorId = req.params.doctorId as string
		
		const result = await doctorServices.getSingleDoctorPublicProfile(
			doctorId
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor Profile Retrieved Successfully",
			data: result,
		});
	},
);


export const doctorControllers = {
	applyAsDoctorController,
	verifyDoctorEmail,
	verifyDoctor,
	getAllDoctors,
	updateDoctorProfile,
	getAvailableDoctorByTodaysSchedule,
	getAllDoctorsListPublic,
	getSingleDoctorPublicProfile
};
