import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreateSchedulePayload } from "./schedule.interface";
import { addDays, differenceInMinutes, startOfDay } from "date-fns";
import { IQuery } from "../../interfaces";
import { ScheduleWhereInput } from "../../../../generated/models";

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

const updateSchedule = async () => {};
const publishSchedule = async () => {};
const deleteSchedule = async () => {};

export const scheduleServices = {
  createSchedule,
  getMySchedule,
  getAllSchedules,
  getScheduleById,
};
