import { prisma } from "../../lib/prisma";
import type {
  IApproveDoctorPayload,
  IDoctor,
  IDoctorVerificationPayload,
  IUpdateDoctorProfilePayload,
} from "./doctor.interface";
import {
  uploadDocumentOnCloudinary,
  uploadDocumentsOnCloudinary,
} from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import {
  DoctorVerificationStatus,
  Role,
  ScheduleStatus,
} from "../../../../generated/enums";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import path from "path";
import ejs from "ejs";
import type { RequestUser } from "../../middleware/checkAuth";
import type { IQuery } from "../../interfaces";
import type { DoctorWhereInput } from "../../../../generated/models";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";
import { addDays, startOfDay } from "date-fns";

const applyAsDoctorService = async (
  payload: IDoctor,
  resume: Express.Multer.File,
  additionalFiles: Express.Multer.File[],
) => {
  const userExists = await prisma.user.findUnique({
    where: {
      email: payload.user.email,
    },
  });
  if (userExists) {
    throw new AppError(
      httpStatus.CONFLICT,
      "User Already Exists with this email",
    );
  }
  const hashedPassword = await bcrypt.hash(
    payload.user.password,
    Number(config.bcrypt_salt_rounds),
  );
  const resumeResult = await uploadDocumentOnCloudinary(resume);
  const additionalFilesResult = additionalFiles?.length
    ? await uploadDocumentsOnCloudinary(additionalFiles)
    : [];

  const doctorApplication = await prisma.user.create({
    data: {
      ...payload.user,
      password: hashedPassword,
      role: Role.DOCTOR,
      doctor: {
        create: {
          ...payload.doctor,
          name: payload.user.name,
          email: payload.user.email,
          resume: resumeResult.url,
          resumePublicId: resumeResult.publicId,
          additionalFiles: additionalFilesResult.map((file) => ({
            url: file.url,
            publicId: file.publicId,
          })),
        },
      },
    },
  });

  // redis

  const expirationSeconds = 60 * 60; // 1 hr

  const otpKey = `doctor-app:otp:${payload.user.email}`;
  const otp = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(otpKey, otp, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  // ejs email to verification

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/doctor-verification.ejs",
  );

  const doctorVerificationHtmlContent = await ejs.renderFile(templatePath, {
    otp: otp,
    expiryMinutes: expirationSeconds / 60,
    userName: payload.user.name,
  });

  await transporter.sendMail({
    from: config.send_email,
    to: payload.user.email,
    subject: "Doctor Verification OTP",
    html: doctorVerificationHtmlContent,
  });

  return doctorApplication;
};

const verifyDoctorEmail = async (payload: IDoctorVerificationPayload) => {
  const otp = payload.otp;
  const email = payload.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
      role: Role.DOCTOR,
    },
  });

  if (!existingUser) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Doctor Application Not Found. Please Apply Again",
    );
  }
  if (existingUser.emailVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email Already Verified");
  }

  const otpKey = `doctor-app:otp:${payload.email}`;
  // get the OTP from redis
  const getOtp = await redisClient.get(otpKey);

  if (!getOtp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "OTP Expired. Your Application Window has Closed, Please Try Again",
    );
  }
  if (getOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Your OTP Doesn't Match");
  }
  // after verification delete redis OTP and update Doctor email

  await redisClient.del(otpKey);

  const verifyDoctorEmail = await prisma.user.update({
    where: {
      id: existingUser.id,
    },
    data: { emailVerified: true },
    omit: { password: true },
    include: { doctor: true },
  });

  return verifyDoctorEmail;
};

const approveDoctor = async (
  payload: IApproveDoctorPayload,
  reviewer: RequestUser,
) => {
  const { doctorId, verificationStatus, rejectionReason } = payload;

  const existingDoctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { user: true },
  });

  if (!existingDoctor) {
    throw new AppError(httpStatus.NOT_FOUND, `Doctor not found.`);
  }

  if (existingDoctor.isDeleted) {
    throw new AppError(httpStatus.GONE, "This doctor record has been deleted.");
  }

  if (!existingDoctor.user?.emailVerified) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "The associated doctor account is not email verified.",
    );
  }

  if (existingDoctor.verificationStatus !== DoctorVerificationStatus.PENDING) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Doctor has already been ${existingDoctor.verificationStatus.toLowerCase()}`,
    );
  }

  if (
    verificationStatus === DoctorVerificationStatus.REJECTED &&
    !rejectionReason
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Rejection reason is required when rejecting a doctor application",
    );
  }
  // updateDoctor

  const updateDoctor = await prisma.doctor.update({
    where: {
      id: doctorId,
    },
    data: {
      verificationStatus,
      rejectionReason:
        verificationStatus === DoctorVerificationStatus.REJECTED
          ? rejectionReason
          : null,
      reviewedBy: reviewer.userId,
      reviewAt: new Date(),
    },
  });

  const isApproved = verificationStatus === DoctorVerificationStatus.APPROVED;

  const templatePath = path.join(
    process.cwd(),
    `src/app/templates/${isApproved ? "doctor-approved.ejs" : "doctor-rejection.ejs"}`,
  );

  const templateData = {
    userName: updateDoctor.name,
    rejectionReason: updateDoctor.rejectionReason,
  };

  const htmlTemplate = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.send_email,
    to: updateDoctor.email,
    subject: isApproved
      ? "Your Doctor Application Has Been Approved"
      : "Your Doctor Application Has Rejected",
    html: htmlTemplate,
  });

  return updateDoctor;
};

const getAllDoctors = async (query: IQuery) => {
  // search, pagination, sorting
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: DoctorWhereInput[] = [];

  // searching
  if (query.searchTerm) {
    andConditions.push({
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
    });
  }

  //filtering
  if (query.specialization) {
    andConditions.push({
      specialization: { equals: query.specialization, mode: "insensitive" },
    });
  }

  if (query.email) {
    andConditions.push({
      email: { contains: query.email, mode: "insensitive" },
    });
  }

  if (query.licenseNumber) {
    andConditions.push({
      licenseNumber: { equals: query.licenseNumber, mode: "insensitive" },
    });
  }

  if (query.verificationStatus) {
    andConditions.push({
      verificationStatus: query.verificationStatus as DoctorVerificationStatus,
    });
  }

  andConditions.push({ isDeleted: false });

  const allDoctors = await prisma.doctor.findMany({
    where: {
      AND: andConditions.length > 0 ? andConditions : undefined,
    },

    take: limit,
    skip: skip,

    orderBy: {
      // sortBy : sortOrder
      [sortBy]: sortOrder,
    },

    include: {
      user: {
        omit: {
          password: true,
        },
      },

      // schedules: true,
      // appointments: true
      // prescriptions: true
    },
  });

  const totalDoctorCount = await prisma.doctor.count({
    where: {
      AND: andConditions,
    },
  });

  return {
    data: allDoctors,
    meta: {
      page: page,
      limit: limit,
      total: totalDoctorCount,
      totalPages: Math.ceil(totalDoctorCount / limit),
    },
  };
};

const updateDoctorProfile = async (
  payload: IUpdateDoctorProfilePayload,
  user: RequestUser,
) => {
  const existingDoctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!existingDoctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
  }

  const updatedDoctor = await prisma.doctor.update({
    where: { id: existingDoctor.id },
    data: payload,
  });

  return updatedDoctor;
};

// Fields safe to expose on the public (unauthenticated) doctor-discovery endpoints.
// Deliberately excludes resume/additionalFiles, verification review metadata, and
// anything relation/auth related (user, userId, isDeleted, deletedAt...).

const getAvailableDoctorByTodaysSchedule = async (query: IQuery) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const now = new Date();
  const startOfToday = startOfDay(now);
  const startOfTomorrow = addDays(startOfToday, 1);

  // A doctor is "available today" if they have at least one published,
  // not-yet-started schedule today with open slots left.

  const andConditions: DoctorWhereInput[] = [
    { isDeleted: false },
    { verificationStatus: DoctorVerificationStatus.APPROVED },
    {
      schedules: {
        some: {
          isDeleted: false,
          status: ScheduleStatus.PUBLISHED,
          availableSlots: { gt: 0 },
          startDateTime: {
            gte: startOfToday,
            lt: startOfTomorrow,
            gt: now,
          },
        },
      },
    },
  ];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { name: { contains: query.searchTerm, mode: "insensitive" } },
        { specialization: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  if (query.specialization) {
    andConditions.push({
      specialization: { equals: query.specialization, mode: "insensitive" },
    });
  }

  const availableDoctors = await prisma.doctor.findMany({
    where: {
      AND: andConditions,
    },

    take: limit,
    skip,

    orderBy: {
      [sortBy]: sortOrder,
    },

    select: {
      id: true,
      name: true,
      specialization: true,
      licenseNumber: true,
      qualifications: true,
      experienceYears: true,
      bio: true,
      consultationFee: true,
      createdAt: true,
      schedules: {
        where: {
          isDeleted: false,
          status: ScheduleStatus.PUBLISHED,
          availableSlots: { gt: 0 },
          startDateTime: {
            gte: startOfToday,
            lt: startOfTomorrow,
            gt: now,
          },
        },
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          startDateTime: true,
          endDateTime: true,
          availableSlots: true,
          totalSlots: true,
        },
      },
    },
  });
  const totalAvailableDoctorCount = await prisma.doctor.count({
    where: { AND: andConditions },
  });

  return {
    data: availableDoctors,
    meta: {
      page,
      limit,
      total: totalAvailableDoctorCount,
      totalPages: Math.ceil(totalAvailableDoctorCount / limit),
    },
  };
};

const getAllDoctorsListPublic = async (query: IQuery) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: DoctorWhereInput[] = [
    { isDeleted: false },
    { verificationStatus: DoctorVerificationStatus.APPROVED },
  ];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { name: { contains: query.searchTerm, mode: "insensitive" } },
        { specialization: { contains: query.searchTerm, mode: "insensitive" } },
        { qualifications: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  if (query.specialization) {
    andConditions.push({
      specialization: { equals: query.specialization, mode: "insensitive" },
    });
  }

  const allDoctors = await prisma.doctor.findMany({
    where: {
      AND: andConditions,
    },

    take: limit,
    skip,

    orderBy: {
      [sortBy]: sortOrder,
    },

    select: {
      id: true,
      name: true,
      specialization: true,
      licenseNumber: true,
      qualifications: true,
      experienceYears: true,
      bio: true,
      consultationFee: true,
      createdAt: true,
    },
  });

  const totalDoctorCount = await prisma.doctor.count({
    where: { AND: andConditions },
  });

  return {
    data: allDoctors,
    meta: {
      page,
      limit,
      total: totalDoctorCount,
      totalPages: Math.ceil(totalDoctorCount / limit),
    },
  };
};

const getSingleDoctorPublicProfile = async (doctorId: string) => {

	const doctor = await prisma.doctor.findUnique({
		where: {
			id: doctorId,
			isDeleted: false,
			verificationStatus: DoctorVerificationStatus.APPROVED,
		},
		select: {
			id: true,
			name: true,
			specialization: true,
			licenseNumber: true,
			qualifications: true,
			experienceYears: true,
			bio: true,
			consultationFee: true,
			createdAt: true,
		},
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Not Found");
	}

	return doctor;
}

export const doctorServices = {
  applyAsDoctorService,
  verifyDoctorEmail,
  approveDoctor,
  getAllDoctors,
  updateDoctorProfile,
  getAvailableDoctorByTodaysSchedule,
  getAllDoctorsListPublic,
  getSingleDoctorPublicProfile
};
