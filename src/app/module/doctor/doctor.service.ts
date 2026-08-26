import { prisma } from "../../lib/prisma";
import { IDoctor } from "./doctor.interface";
import {
  uploadDocumentOnCloudinary,
  uploadDocumentsOnCloudinary,
} from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import { Role } from "../../../../generated/enums";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import path from "path";
import ejs from "ejs";

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
      doctor:{
		create:{
			...payload.doctor,
			name: payload.user.name,
			email: payload.user.email,
      resume: resumeResult.url,
      resumePublicId: resumeResult.publicId,
      additionalFiles: additionalFilesResult.map((file) => ({
        url: file.url,
        publicId: file.publicId,
      })),
		}
	  }
    },
  });

  // redis 

  const expirationSeconds = 60 * 60 // 1 hr

  const otpKey = `doctor-app:otp:${payload.user.email}`
  const otp = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(otpKey, otp, {
    expiration:{
      type: "EX",
      value: expirationSeconds
    }
  })

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

  return doctorApplication
};

const verifyDoctorEmail = async (payload: {email: string, otp: string}) => {
  
}

export const doctorServices = {
  applyAsDoctorService,
  verifyDoctorEmail
};
