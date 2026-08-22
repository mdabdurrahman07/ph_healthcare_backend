import { prisma } from "../../lib/prisma";
import { IDoctor } from "./doctor.interface";
import {
  uploadDocumentOnCloudinary,
  uploadDocumentsOnCloudinary,
} from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import { Role } from "../../../../generated/enums";

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
  return doctorApplication
};

export const doctorServices = {
  applyAsDoctorService,
};
