import bcrypt from "bcryptjs";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import { AuthProvider, Role, UserStatus } from "../../../../generated/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import type {
	IForgotPasswordPayload,
	IGoogleLoginPayload,
	ILoginUserPayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPasswordPayload,
	IVerifiedEmailPayload,
} from "./auth.interface";
import { googleClient } from "../../lib/googleAuth";
import type { TokenPayload } from "google-auth-library";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import path from "path";
import ejs from "ejs";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";

const registerPatient = async (payload: IRegisterPatientPayload) => {
	const { name, password, patient: patientData } = payload;
	const email = payload.email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new AppError(
			httpStatus.CONFLICT,
			"User with this email already exists",
		);
	}

	const hashedPassword = await bcrypt.hash(
		password,
		Number(config.bcrypt_salt_rounds),
	);

	// redisDataStore
	const expirationSeconds = 5 * 60;

	//? email verification OTP , storing in redisDB
	const otp = crypto.randomInt(100000, 1000000).toString();
	const otpKey = `patient-register-otp:${email}`;
	await redisClient.set(otpKey, otp, {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});
	//? storing the user data at redisDB
	const patientRegisterKey = `patient-register:${email}`;
	const redisUserDataPayload = {
		name,
		email,
		password: hashedPassword,
		patient: patientData,
	};
	await redisClient.set(
		patientRegisterKey,
		JSON.stringify(redisUserDataPayload),
		{
			expiration: {
				type: "EX",
				value: expirationSeconds,
			},
		},
	);

	// ejs html template

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/registrationOtp.ejs",
	);

	const registrationHtmlContent = await ejs.renderFile(templatePath, {
		otp: otp,
		expiryMinutes: expirationSeconds / 60,
		userName: name,
	});

	await transporter.sendMail({
		from: config.send_email,
		to: email,
		subject: "Registration OTP",
		html: registrationHtmlContent,
	});
};

const verifyPatientService = async (payload: IVerifiedEmailPayload) => {
	const { otp } = payload;
	const email = payload.email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists?.emailVerified) {
		throw new AppError(httpStatus.BAD_REQUEST, "Email already verified");
	}

	if (isUserExists?.status === "BLOCKED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is Blocked");
	}

	if (isUserExists?.status === "DELETED" || isUserExists?.isDeleted) {
		throw new AppError(httpStatus.GONE, "User is status is deleted");
	}

	// redis OTP checking

	const otpKey = `patient-register-otp:${email}`;

	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}
	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Does not match");
	}

	await redisClient.del(otpKey);

	const patientRegisterKey = `patient-register:${email}`;

	const redisPatientData = await redisClient.get(patientRegisterKey);

	if (!redisPatientData) {
		throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists");
	}

	const patientPayload: IRegisterPatientPayload = JSON.parse(redisPatientData);

	const createdUser = await prisma.user.create({
		data: {
			name: patientPayload.name,
			email: patientPayload.email,
			password: patientPayload.password,
			role: Role.PATIENT,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			patient: {
				create: {
					name: patientPayload.name,
					email: patientPayload.email,
					contactNumber: patientPayload.patient?.contactNumber || "",
				},
			},
		},
		omit: { password: true },
		include: { patient: true },
	});

	// ejs html template

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/verificationSuccess.ejs",
	);

	const verificationSuccessHtmlContext = await ejs.renderFile(templatePath, {
		userName: patientPayload.name,
	});

	await transporter.sendMail({
		from: config.send_email,
		to: email,
		subject: "Verification Successful & Welcome to PH HealthCare",
		html: verificationSuccessHtmlContext,
	});

	await redisClient.del(patientRegisterKey);
	const { patient, ...user } = createdUser;
	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		user,
		patient,
		accessToken,
		refreshToken,
	};
};

const loginUser = async (payload: ILoginUserPayload) => {
	const { password } = payload;
	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.GONE, "User is deleted");
	}

	const isPasswordMatched = await bcrypt.compare(
		password,
		user.password as string,
	);

	if (!isPasswordMatched) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid credentials");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const getMe = async (user: IRequestUser) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			id: user.userId,
		},
		include: {
			patient: true,
		},
		omit: {
			password: true,
		},
	});

	if (!isUserExists) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			config.node_env === "development"
				? verifiedRefreshToken.error
				: "Invalid refresh token",
		);
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id: data.userId },
	});

	if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"User is inactive or not found",
		);
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const googleService = async (payload: IGoogleLoginPayload) => {
	let googleIdTokenPayload: TokenPayload | null | undefined = null;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});
		googleIdTokenPayload = ticket.getPayload();
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.log("Google ID Token Verification Failed", error);
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"Invalid or expired google id token",
			);
		}
		console.log("Unknown error occurred google login, try again");
	}
	if (!googleIdTokenPayload) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid or expired google id token",
		);
	}

	if (!googleIdTokenPayload.email) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid google email");
	}
	if (!googleIdTokenPayload.name) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid google name");
	}

	const ifPatientExistWithGoogleAuth = await prisma.user.findUnique({
		where: {
			email: googleIdTokenPayload.email,
			role: Role.PATIENT,
			googleId: googleIdTokenPayload.sub,
		},
	});
	let user = ifPatientExistWithGoogleAuth;
	if (!ifPatientExistWithGoogleAuth) {
		const ifPatientExistWithCredentials = await prisma.user.findUnique({
			where: {
				email: googleIdTokenPayload.email,
				role: Role.PATIENT,
				authProvider: AuthProvider.CREDENTIALS,
			},
		});
		if (ifPatientExistWithCredentials) {
			if (!ifPatientExistWithCredentials.emailVerified) {
				throw new AppError(httpStatus.FORBIDDEN, "Email not verified");
			}
			if (ifPatientExistWithCredentials.status === UserStatus.BLOCKED) {
				throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
			}
			if (
				ifPatientExistWithCredentials.isDeleted ||
				ifPatientExistWithCredentials.status === UserStatus.DELETED
			) {
				throw new AppError(httpStatus.GONE, "User is deleted");
			}

			user = await prisma.user.update({
				where: {
					id: ifPatientExistWithCredentials.id,
				},
				data: {
					googleId: googleIdTokenPayload.sub,
				},
			});
		} else {
			user = await prisma.user.create({
				data: {
					email: googleIdTokenPayload.email,
					role: Role.PATIENT,
					googleId: googleIdTokenPayload.sub,
					authProvider: AuthProvider.GOOGLE,
					name: googleIdTokenPayload.name,
					emailVerified: true,
					patient: {
						create: {
							name: googleIdTokenPayload.name,
							email: googleIdTokenPayload.email,
						},
					},
				},
			});
		}
	}
	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}
	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.GONE, "User is deleted");
	}
	if (user.password === null && user.googleId !== null) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"User Already Registered With Google. Try to Login with Google",
		);
	}
	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const forgotPasswordService = async (payload: IForgotPasswordPayload) => {
	const { email } = payload;
	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});
	if (!isUserExist) {
		throw new AppError(httpStatus.NOT_FOUND, "User Doesn't exist");
	}
	if (isUserExist.status === "BLOCKED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is Blocked");
	}
	if (!isUserExist.emailVerified) {
		throw new AppError(httpStatus.FORBIDDEN, "User not verified");
	}
	if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
		throw new AppError(httpStatus.GONE, "User is Deleted");
	}

	if (isUserExist.authProvider === "GOOGLE" && isUserExist.googleId) {
		throw new AppError(httpStatus.BAD_REQUEST, "User has Account with Google");
	}

	const otp = crypto.randomInt(100000, 1000000).toString();
	const key = `forget-password-otp:${isUserExist.email}`;
	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: 5 * 60,
		},
	});

	// ejs html template

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/forgot-password.ejs",
	);

	const forgotPasswordHtmlContent = await ejs.renderFile(templatePath, {
		otp: otp,
		expiryMinutes: 5,
		userName: isUserExist.name,
	});

	await transporter.sendMail({
		from: config.send_email,
		to: isUserExist.email,
		subject: "Forgot Password",
		html: forgotPasswordHtmlContent,
	});
};
const resetPasswordService = async (payload: IResetPasswordPayload) => {
	const { email, newPassword, otp } = payload;
	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});
	if (!isUserExist) {
		throw new AppError(httpStatus.NOT_FOUND, "User Doesn't exist");
	}
	if (isUserExist.status === "BLOCKED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is Blocked");
	}
	if (!isUserExist.emailVerified) {
		throw new AppError(httpStatus.FORBIDDEN, "User not verified");
	}
	if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
		throw new AppError(httpStatus.GONE, "User is Deleted");
	}

	if (isUserExist.authProvider === "GOOGLE" && isUserExist.googleId) {
		throw new AppError(httpStatus.BAD_REQUEST, "User has Account with Google");
	}

	const key = `forget-password-otp:${isUserExist.email}`;

	const redisOtp = await redisClient.get(key);

	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}
	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Does not match");
	}

	const hashedPassword = await bcrypt.hash(
		newPassword,
		Number(config.bcrypt_salt_rounds),
	);
	await prisma.user.update({
		where: {
			email: isUserExist.email,
		},
		data: {
			password: hashedPassword,
		},
	});
	await redisClient.del([key]);

	// ejs html template

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/password-reset-success.ejs",
	);

	const passwordResetSuccessHtmlContext = await ejs.renderFile(templatePath, {
		userName: isUserExist.name,
		loginUrl: config.login_url,
	});

	await transporter.sendMail({
		from: config.send_email,
		to: isUserExist.email,
		subject: "Password Reset Successful",
		html: passwordResetSuccessHtmlContext,
	});
};

export const AuthService = {
	registerPatient,
	loginUser,
	getMe,
	refreshToken,
	googleService,
	forgotPasswordService,
	resetPasswordService,
	verifyPatientService,
};
