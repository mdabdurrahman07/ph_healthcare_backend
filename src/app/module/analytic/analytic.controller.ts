import  httpStatus  from 'http-status';
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { analyticsServices } from './analytic.service';

const getPatientAnalytics = catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;

    const result = await analyticsServices.getPatientAnalytics(user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Patient Analytics Retrieved Successfully",
        data: result,
    });
});

const getDoctorAnalytics = catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;

    const result = await analyticsServices.getDoctorAnalytics(user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Doctor Analytics Retrieved Successfully",
        data: result,
    });
});

const getAdminAnalytics = catchAsync(async (req: Request, res: Response) => {
    const result = await analyticsServices.getAdminAnalytics();
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Admin Analytics Retrieved Successfully",
        data: result,
    });
});

export const analyticsController = {
    getPatientAnalytics,
    getDoctorAnalytics,
    getAdminAnalytics,
};