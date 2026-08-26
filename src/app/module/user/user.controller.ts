import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { userServices } from "./user.service";
import { AppError } from "../../utils/AppError";

const uploadProfileImageController = catchAsync(
	async (req: Request, res: Response) => {
		const payload = req.file;
		const userId = req.user?.userId;

		if (!payload?.buffer) {
			throw new AppError(httpStatus.BAD_REQUEST, "Profile image is required");
		}

		const response = await userServices.uploadProfileImage(
			payload.buffer,
			userId as string,
		);

		sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Profile Image uploaded successfully",
			data: response,
		});
	},
);

export const userControllers = {
	uploadProfileImageController,
};
