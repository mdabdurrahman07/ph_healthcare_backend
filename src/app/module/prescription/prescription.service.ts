import PDFDocument from "pdfkit";
import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreatePrescriptionPayload } from "./prescription.interface";
import { AppointmentStatus } from "../../../../generated/enums";
import { uploadPrescriptionDocumentOnCloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import config from "../../config";

const createPrescription = async (
	payload: ICreatePrescriptionPayload,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const appointment = await prisma.appointment.findUnique({
		where: { id: payload.appointmentId, doctorId: doctor.id },
		include: { patient: true },
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if (appointment.status !== AppointmentStatus.COMPLETED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Prescription Can Only Be Written For A Completed Appointment",
		);
	}

	if (appointment.prescriptionUrl) {
		throw new AppError(
			httpStatus.CONFLICT,
			"A Prescription Already Exists For This Appointment",
		);
	}

	// PDF Content

	const pdfDocument = new PDFDocument({ margin: 50 });

	const pdfChunks: Buffer[] = [];

	pdfDocument.on("data", (chunk: Buffer) => {
		pdfChunks.push(chunk);
	});

	const pdfReadyPromise = new Promise<Buffer>((resolve) => {
		pdfDocument.on("end", () => {
			resolve(Buffer.concat(pdfChunks));
		});
	});

	//pdf contents

	pdfDocument.fontSize(20).text("PH Healthcare System", { align: "center" });
	pdfDocument.fontSize(14).text("Prescription", { align: "center" });
	pdfDocument.moveDown(2);

	pdfDocument.fontSize(12).text(`Patient Name: ${appointment.patient.name}`);
	pdfDocument.text(`Doctor Name: ${doctor.name}`);
	pdfDocument.text(`Specialization: ${doctor.specialization}`);
	pdfDocument.text(`Date: ${new Date().toDateString()}`);
	pdfDocument.moveDown();

	pdfDocument.fontSize(14).text("Findings");
	pdfDocument.fontSize(12).text(payload.findings);
	pdfDocument.moveDown();

	pdfDocument.fontSize(14).text("Medicines");
	pdfDocument.moveDown(0.5);

	for (let i = 0; i < payload.medicines.length; i++) {
		const medicine = payload.medicines[i];

		pdfDocument.fontSize(12).text(`${i + 1}. ${medicine.name}`);
		pdfDocument.text(`   Dosage: ${medicine.dosage}`);
		pdfDocument.text(`   Duration: ${medicine.duration}`);

		if (medicine.instructions) {
			pdfDocument.text(`   Instructions: ${medicine.instructions}`);
		}

		pdfDocument.moveDown(0.5);
	}

	pdfDocument.end();

	const pdfBuffer = await pdfReadyPromise;

	const prescriptionPdf =
		await uploadPrescriptionDocumentOnCloudinary(pdfBuffer);

	const updatedAppointment = await prisma.appointment.update({
		where: { id: appointment.id },
		data: {
			prescriptionUrl: prescriptionPdf.url,
			prescriptionPublicId: prescriptionPdf.publicId,
		},
	});

	await transporter.sendMail({
		from: config.send_email,
		to: appointment.patient.email,
		subject: "Your Prescription - PH Healthcare System",
		text: "Please find your prescription attached.",
		attachments: [
			{
				filename: "prescription.pdf",
				content: pdfBuffer,
			},
		],
	});

	return updatedAppointment;
};

const getSinglePrescription = async (
	appointmentId: string,
	user: RequestUser,
) => {
	const appointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
		},
		include: {
			patient: {
				select: {
					id: true,
					name: true,
					userId: true,
				},
			},
			doctor: {
				select: {
					id: true,
					name: true,
					userId: true,
				},
			},
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if (!appointment.prescriptionUrl) {
		throw new AppError(httpStatus.NOT_FOUND, "No Prescription Has Been Found");
	}
	return {
		appointment,
		prescription: appointment.prescriptionUrl,
	};
};

export const prescriptionServices = {
	createPrescription,
	getSinglePrescription,
};
