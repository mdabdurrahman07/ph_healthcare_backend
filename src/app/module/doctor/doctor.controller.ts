import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { doctorServices } from "./doctor.service";

const applyAsDoctorController = catchAsync(
  async (req: Request, res: Response) => {
    const result = await doctorServices.applyAsDoctorService()
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Applied as Doctor successfully",
      data: result
    });
  },
);


export const doctorControllers = {
    applyAsDoctorController
}