import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	ICreateSchedulePayload,
	IUpdateSchedulePayload,
} from "./schedule.interface";
import {
	addDays,
	differenceInMinutes,
	isAfter,
	isSameDay,
	startOfDay,
} from "date-fns";
import { IQuery } from "../../interfaces";
import { ScheduleWhereInput } from "../../../../generated/models";
import { ScheduleStatus } from "../../../../generated/enums";

const createSchedule = async (
	payload: ICreateSchedulePayload,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}
	// checking the same dateTime 25 Aug slot
	if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Start Date Time And End Date Time Must Be On The Same Day",
		);
	}
	// checking the startDate is bigger than the endDate like 26 Aug > 25 Aug
	if (isAfter(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"start Date Time Cannot be after End Date Time",
		);
	}

	const startOfTheDay = startOfDay(payload.startDateTime); // 28 Aug => 12.00 Am
	const startOfNextDay = addDays(startOfTheDay, 1); // 29 Aug => 12.00 Am

	const existingScheduleOnThisDate = await prisma.schedule.findFirst({
		where: {
			doctorId: doctor.id,
			isDeleted: false,
			startDateTime: {
				gte: startOfTheDay,
				lt: startOfNextDay,
			},
		},
	});

	if (existingScheduleOnThisDate) {
		throw new AppError(
			httpStatus.CONFLICT,
			"You Already Have A Schedule For This Date",
		);
	}

	// duration of start and end time in minutes
	const durationInMinutes = differenceInMinutes(
		payload.startDateTime,
		payload.endDateTime,
	);

	const MINUTES_ALLOCATED_PER_SLOT = 20;

	const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT);

	const schedule = await prisma.schedule.create({
		data: {
			startDateTime: payload.startDateTime,
			endDateTime: payload.endDateTime,
			meetingLink: payload.meetingLink,
			totalSlots,
			availableSlots: totalSlots,
			doctorId: doctor.id,
		},
		include: {
			doctor: {
				select: {
					name: true,
					email: true,
					address: true,
					contactNumber: true,
					consultationFee: true,
				},
			},
		},
	});
	return schedule;
};

const getMySchedule = async (query: IQuery, user: RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	// search, pagination, sorting
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: ScheduleWhereInput[] = [
		{
			doctorId: doctor.id,
		},
		{
			isDeleted: false,
		},
	];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const schedules = await prisma.schedule.findMany({
		where: {
			AND: andConditions,
		},
		take: limit,
		skip: skip,

		orderBy: {
			// sortBy : sortOrder
			[sortBy]: sortOrder,
		},
		include: {
			appointments: {
				include: {
					patient: true,
				},
			},
		},
	});

	const total = await prisma.schedule.count({ where: { AND: andConditions } });

	return {
		data: schedules,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getAllSchedules = async (query: IQuery) => {
	// search, pagination, sorting
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: ScheduleWhereInput[] = [];
	if (query.doctorId) {
		andConditions.push({
			doctorId: query.doctorId,
		});
	}
	if (query.email) {
		andConditions.push({
			doctor: {
				email: query.email,
			},
		});
	}

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	// search
	if (query.searchTerm) {
		andConditions.push({
			doctor: {
				OR: [
					{ name: { contains: query.searchTerm, mode: "insensitive" } },
					{ email: { contains: query.searchTerm, mode: "insensitive" } },
					{
						specialization: {
							contains: query.searchTerm,
							mode: "insensitive",
						},
					},
					{
						licenseNumber: {
							contains: query.searchTerm,
							mode: "insensitive",
						},
					},
				],
			},
		});
	}
	const schedules = await prisma.schedule.findMany({
		where: {
			AND: andConditions,
		},
		take: limit,
		skip: skip,

		orderBy: {
			// sortBy : sortOrder
			[sortBy]: sortOrder,
		},
		include: {
			appointments: {
				include: {
					patient: true,
				},
			},
		},
	});
	const total = await prisma.schedule.count({ where: { AND: andConditions } });

	return {
		data: schedules,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getScheduleById = async (scheduleId: string) => {
	const schedule = await prisma.schedule.findUnique({
		where: { id: scheduleId },
		include: {
			doctor: {
				select: {
					id: true,
					name: true,
					email: true,
					specialization: true,
					userId: true,
				},
			},
			appointments: {
				include: {
					patient: true,
					payments: true,
				},
			},
		},
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
	}
};

const updateSchedule = async (
	scheduleId: string,
	payload: IUpdateSchedulePayload,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});
	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}
	const schedule = await prisma.schedule.findUnique({
		where: { id: scheduleId, doctorId: doctor.id },
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
	}

	if (schedule.status === ScheduleStatus.PUBLISHED && schedule.availableSlots) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule once published and appointment booked cannot be updated",
		);
	}

	// const updateData: IUpdateSchedulePayload = {}

	// if(payload.meetingLink){
	//   updateData.meetingLink = payload.meetingLink || schedule.meetingLink
	// }
	payload.meetingLink = payload.meetingLink || schedule.meetingLink;
	payload.startDateTime = payload.startDateTime || schedule.startDateTime;
	payload.endDateTime = payload.endDateTime || schedule.endDateTime;

	// checking the same dateTime 25 Aug slot
	if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Start Date Time And End Date Time Must Be On The Same Day",
		);
	}
	// checking the startDate is bigger than the endDate like 26 Aug > 25 Aug
	if (isAfter(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"start Date Time Cannot be after End Date Time",
		);
	}

	const startOfTheDay = startOfDay(payload.startDateTime); // 28 Aug => 12.00 Am
	const startOfNextDay = addDays(startOfTheDay, 1); // 29 Aug => 12.00 Am

	const existingScheduleOnThisDate = await prisma.schedule.findFirst({
		where: {
			doctorId: doctor.id,
			isDeleted: false,
			startDateTime: {
				gte: startOfTheDay,
				lt: startOfNextDay,
			},
		},
	});

	if (existingScheduleOnThisDate) {
		throw new AppError(
			httpStatus.CONFLICT,
			"You Already Have A Schedule For This Date",
		);
	}

	// duration of start and end time in minutes
	const durationInMinutes = differenceInMinutes(
		payload.startDateTime,
		payload.endDateTime,
	);

	const MINUTES_ALLOCATED_PER_SLOT = 20;

	const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT);

	const scheduleUpdate = await prisma.schedule.update({
		where: {
			id: schedule.id,
		},
		data: {
			startDateTime: payload.startDateTime,
			endDateTime: payload.endDateTime,
			meetingLink: payload.meetingLink,
			totalSlots,
			availableSlots: totalSlots,
			doctorId: doctor.id,
		},
		include: {
			doctor: {
				select: {
					name: true,
					email: true,
					address: true,
					contactNumber: true,
					consultationFee: true,
				},
			},
		},
	});

	return scheduleUpdate;
};
const publishSchedule = async (scheduleId: string, user: RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}
	const schedule = await prisma.schedule.findUnique({
		where: { id: scheduleId, doctorId: doctor.id },
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
	}
	if (schedule.status === ScheduleStatus.PUBLISHED) {
		throw new AppError(httpStatus.CONFLICT, "Schedule Is Already Published");
	}
	const publishedSchedule = await prisma.schedule.update({
		where: { id: schedule.id },
		data: {
			status: ScheduleStatus.PUBLISHED,
		},
	});

	return publishedSchedule;
};
const deleteSchedule = async (scheduleId: string, user: RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: {
			userId: user.userId,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}
	const schedule = await prisma.schedule.findUnique({
		where: { id: scheduleId, doctorId: doctor.id },
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
	}

	if (schedule.status === ScheduleStatus.PUBLISHED && schedule.availableSlots) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule once published and appointment booked cannot be deleted",
		);
	}

	const deletedSchedule = await prisma.schedule.update({
		where: {
			id: schedule.id,
		},
		data: {
			isDeleted: true,
			deletedAt: new Date(),
		},
	});

	return deletedSchedule;
};

const getTodaysSchedules = async (query: IQuery) => {
	if (!query.doctorId) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Doctor Id Must Be Provided In Query",
		);
	}

	const doctor = await prisma.doctor.findUnique({
		where: { id: query.doctorId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const now = new Date();
	const startOfToday = startOfDay(now); // time will be 12:00AM
	const startOfTomorrow = addDays(startOfToday, 1); // the nextday

	const andConditions: ScheduleWhereInput[] = [
		{
			doctorId: query.doctorId,
		},
		{
			isDeleted: false,
		},
		{
			status: ScheduleStatus.PUBLISHED,
		},
		{
			startDateTime: {
				gte: startOfToday,
				lt: startOfTomorrow,
				gt: now,
			},
		},
		{
			availableSlots: { gt: 0 },
		},
	];

	const schedules = await prisma.schedule.findMany({
		where: {
			AND: andConditions,
		},

		take: limit,
		skip,
		orderBy: {
			// sortBy : sortOrder
			[sortBy]: sortOrder,
		},
	});

	const total = await prisma.schedule.count({ where: { AND: andConditions } });

	return {
		data: schedules,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

export const scheduleServices = {
	createSchedule,
	getMySchedule,
	getAllSchedules,
	getScheduleById,
	updateSchedule,
	publishSchedule,
	deleteSchedule,
	getTodaysSchedules,
};
