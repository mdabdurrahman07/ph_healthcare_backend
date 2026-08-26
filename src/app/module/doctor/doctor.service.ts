import { prisma } from "../../lib/prisma";
import {
	IApproveDoctorPayload,
	IDoctor,
	IDoctorVerificationPayload,
} from "./doctor.interface";
import {
	uploadDocumentOnCloudinary,
	uploadDocumentsOnCloudinary,
} from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import { DoctorVerificationStatus, Role } from "../../../../generated/enums";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import path from "path";
import ejs from "ejs";
import { RequestUser } from "../../middleware/checkAuth";
import { IQuery } from "../../interfaces";
import { DoctorWhereInput } from "../../../../generated/models";

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
		throw new Error("User Already Exists with this email");
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
		throw new Error("Doctor Application Not Found. Please Apply Again");
	}
	if (existingUser.emailVerified) {
		throw new Error("Email Already Verified");
	}

	const otpKey = `doctor-app:otp:${payload.email}`;
	// get the OTP from redis
	const getOtp = await redisClient.get(otpKey);

	if (!getOtp) {
		throw new Error(
			"OTP Expired. Your Application Window has Closed, Please Try Again",
		);
	}
	if (getOtp !== otp) {
		throw new Error("Your OTP Doesn't Match");
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
		throw new Error(`Doctor not found.`);
	}

	if (existingDoctor.isDeleted) {
		throw new Error("This doctor record has been deleted.");
	}

	if (!existingDoctor.user?.emailVerified) {
		throw new Error("The associated doctor account is not email verified.");
	}

	if (existingDoctor.verificationStatus !== DoctorVerificationStatus.PENDING) {
		throw new Error(
			`Doctor has already been ${existingDoctor.verificationStatus.toLowerCase()}`,
		);
	}

	if (
		verificationStatus === DoctorVerificationStatus.REJECTED &&
		!rejectionReason
	) {
		throw new Error(
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

export const doctorServices = {
	applyAsDoctorService,
	verifyDoctorEmail,
	approveDoctor,
	getAllDoctors,
};
