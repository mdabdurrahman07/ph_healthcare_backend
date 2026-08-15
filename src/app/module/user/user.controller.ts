import httpStatus from "http-status";
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { userServices } from "./user.service";

const uploadProfileImageController = catchAsync(
  async (req: Request, res: Response) => {
    const payload = req.file;

    if (!payload?.buffer) {
      throw new Error("Profile image is required");
    }

    const response = await userServices.uploadProfileImage(payload.buffer);

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "SUCCESS",
      data: response,
    });
  },
);

export const userControllers = {
  uploadProfileImageController,
};
