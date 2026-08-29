import httpStatus from "http-status";
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { scheduleServices } from "./schedule.service";
import { sendResponse } from "../../utils/sendResponse";

const createSchedule = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await scheduleServices.createSchedule(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Schedule Created Successfully",
		data: result,
	});
});

const getMySchedules = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;

	const { data, meta } = await scheduleServices.getMySchedule(req.query, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedules Retrieved Successfully",
		data,
		meta,
	});
});

const getAllSchedules = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await scheduleServices.getAllSchedules(req.query);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedules Retrieved Successfully",
		data,
		meta,
	});
});

const getTodaysSchedules = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await scheduleServices.getTodaysSchedules(req.query);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Today's Schedules Retrieved Successfully",
		data,
		meta,
	});
});

const getScheduleById = catchAsync(async (req: Request, res: Response) => {
	const scheduleId = req.params.scheduleId as string;

	const result = await scheduleServices.getScheduleById(scheduleId);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule Retrieved Successfully",
		data: result,
	});
});

const updateSchedule = catchAsync(async (req: Request, res: Response) => {
	const scheduleId = req.params.scheduleId as string;
	const payload = req.body;
	const user = req.user!;

	const result = await scheduleServices.updateSchedule(
		scheduleId,
		payload,
		user,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule Updated Successfully",
		data: result,
	});
});

const publishSchedule = catchAsync(async (req: Request, res: Response) => {
	const scheduleId = req.params.scheduleId as string;
	const user = req.user!;

	const result = await scheduleServices.publishSchedule(scheduleId, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule Published Successfully",
		data: result,
	});
});

const deleteSchedule = catchAsync(async (req: Request, res: Response) => {
	const scheduleId = req.params.scheduleId as string;
	const user = req.user!;

	const result = await scheduleServices.deleteSchedule(scheduleId, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule Deleted Successfully",
		data: result,
	});
});

export const scheduleController = {
	createSchedule,
	getMySchedules,
	getAllSchedules,
	getTodaysSchedules,
	getScheduleById,
	updateSchedule,
	publishSchedule,
	deleteSchedule,
};
