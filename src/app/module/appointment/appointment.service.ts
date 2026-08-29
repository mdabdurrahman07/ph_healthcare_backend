import {
	AppointmentStatus,
	PaymentStatus,
	ScheduleStatus,
} from "../../../../generated/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";
import {
	IBookAppointmentPayload,
	IPayAppointmentPayload,
} from "./appointment.interface";
import { addMinutes, isBefore, isSameDay } from "date-fns";
import { transporter } from "../../lib/nodemailer";
import PDFDocument from "pdfkit";

const createNewBooking = async (
	payload: IBookAppointmentPayload,
	user: RequestUser,
) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const patient = await prisma.patient.findUnique({
			where: {
				userId: user.userId,
			},
		});
		if (!patient) {
			throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
		}
		const schedule = await prisma.schedule.findUnique({
			where: { id: payload.scheduleId },
			include: { doctor: true },
		});

		if (!schedule || schedule.isDeleted) {
			throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
		}

		if (schedule.status !== ScheduleStatus.PUBLISHED) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Is Not Published Yet",
			);
		}

		const now = new Date();

		if (!isSameDay(now, schedule.startDateTime)) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Is Not Available Today",
			);
		}

		if (!isBefore(now, schedule.startDateTime)) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Has Already Started",
			);
		}
		// can't take same appointment in single day
		const existingAppointment = await prisma.appointment.findFirst({
			where: {
				patientId: patient.id,
				scheduleId: schedule.id,
				// status:{
				// 	not: AppointmentStatus.CANCELLED
				// }
			},
			include: {
				schedule: {
					include: {
						doctor: true,
					},
				},
			},
		});
		if (existingAppointment?.status === AppointmentStatus.PENDING) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You Already Have A Pending Appointment",
			);
		}
		if (existingAppointment?.status === AppointmentStatus.CONFIRMED) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You Already Have A Confirmed Appointment",
			);
		}
		if (existingAppointment?.status === AppointmentStatus.ONGOING) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You Already Have A Ongoing Appointment",
			);
		}
		if (existingAppointment?.status === AppointmentStatus.COMPLETED) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You Already Have A Completed Appointment On This Schedule. Please Try Again Another Day",
			);
		}
		if (schedule.availableSlots === 0) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Is Fully Booked",
			);
		}
		if (!schedule.doctor.consultationFee) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Doctor Has Not Set A Consultation Fee Yet",
			);
		}

		const amount = schedule.doctor.consultationFee.toString();

		const appointment = await tx.appointment.create({
			data: {
				status: AppointmentStatus.PENDING,
				patientId: patient.id,
				doctorId: schedule.doctor.id,
				scheduleId: schedule.id,
			},
		});

		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash access token found");
		}

		const getBkashHeaders = () => ({
			"Content-Type": "application/json",
			Accept: "application/json",
			Authorization: bkashIdToken,
			"X-App-Key": config.bkash_app_key,
		});

		const bkashCreatePayment = await fetch(
			`${config.bkash_sandbox_base_url}/tokenized/checkout/create`,

			{
				method: "POST",
				headers: getBkashHeaders(),
				body: JSON.stringify({
					mode: "0011",
					// payerReference: "01723888888", //user email or phone number
					payerReference: user.email, //user email or phone number
					callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
					amount: amount,
					currency: "BDT",
					intent: "sale",
					// merchantInvoiceNumber: "Inv4", // apppointment id
					merchantInvoiceNumber: appointment.id, // apppointment id
				}),
			},
		);

		const bkashCreatePaymentResult = await bkashCreatePayment.json();

		// console.log(bkashCreatePaymentResult, "bkashCreatePaymentResult");

		// payment model business logic

		await tx.payment.create({
			data: {
				merchantInvoiceNumber: appointment.id,
				appointmentId: appointment.id,
				amount: amount,
				gatewayResponse: bkashCreatePaymentResult,
				bkashPaymentId: bkashCreatePaymentResult.paymentID,
			},
		});

		return {
			paymentUrl: bkashCreatePaymentResult.bkashURL,
		};
	});

	return transactionResult;
};

const payAppointment = async (
	payload: IPayAppointmentPayload,
	user: RequestUser,
) => {
	const appointmentId = payload.appointmentId;
	const existingAppointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
		},
		include: {
			schedule: {
				include: {
					doctor: true,
				},
			},
		},
	});

	if (!existingAppointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if (existingAppointment.status !== "PENDING") {
		throw new AppError(httpStatus.BAD_REQUEST, "No Pending Bookings");
	}
	if (!existingAppointment.schedule.doctor.consultationFee) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor has not set a consultation fee yet",
		);
	}
	const amount = existingAppointment.schedule.doctor.consultationFee.toString();
	const bkashIdToken = await getBkashIdToken();

	if (!bkashIdToken) {
		throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash access token found");
	}

	const getBkashHeaders = () => ({
		"Content-Type": "application/json",
		Accept: "application/json",
		Authorization: bkashIdToken,
		"X-App-Key": config.bkash_app_key,
	});

	const bkashCreatePayment = await fetch(
		`${config.bkash_sandbox_base_url}/tokenized/checkout/create`,

		{
			method: "POST",
			headers: getBkashHeaders(),
			body: JSON.stringify({
				mode: "0011",
				// payerReference: "01723888888", //user email or phone number
				payerReference: user.email, //user email or phone number
				callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
				amount: amount,
				currency: "BDT",
				intent: "sale",
				// merchantInvoiceNumber: "Inv4", // apppointment id
				merchantInvoiceNumber: existingAppointment.id, // apppointment id
			}),
		},
	);

	const bkashCreatePaymentResult = await bkashCreatePayment.json();

	await prisma.payment.update({
		where: {
			appointmentId: existingAppointment.id,
		},
		data: {
			merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
			gatewayResponse: bkashCreatePaymentResult,
			bkashPaymentId: bkashCreatePaymentResult.paymentID,
		},
	});

	return {
		paymentUrl: bkashCreatePaymentResult.bkashURL,
	};
};

const bookingAppointmentCallback = async (query: Record<string, any>) => {
	const transaction = await prisma.$transaction(async (tx) => {
		const paymentId = query.paymentID;
		if (!paymentId) {
			throw new AppError(httpStatus.BAD_REQUEST, "Payment Id Missing");
		}
		const status = query.status;
		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash access token found");
		}

		const getBkashHeaders = () => ({
			"Content-Type": "application/json",
			Accept: "application/json",
			Authorization: bkashIdToken,
			"X-App-Key": config.bkash_app_key,
		});
		if (!status) {
			throw new AppError(httpStatus.BAD_REQUEST, "Payment Status Missing");
		}

		const executedPaymentResponse = await fetch(
			`${config.bkash_sandbox_base_url}/tokenized/checkout/execute`,
			{
				method: "POST",
				headers: getBkashHeaders(),
				body: JSON.stringify({
					paymentID: paymentId,
				}),
			},
		);
		const result = await executedPaymentResponse.json();
		if (status === "success") {
			const appointment = await prisma.appointment.findUnique({
				where:{
					id: result.merchantInvoiceNumber
				},
				include:{
					schedule: true,
					patient: true,
					doctor: true
				}
			})
			if(!appointment){
				throw new AppError(httpStatus
					.BAD_REQUEST, "No appointment has found"
				)
			}
			const newAvailableSlots = appointment.schedule.availableSlots - 1;
			const alreadyBookedSlots = appointment.schedule.totalSlots - appointment.schedule.availableSlots
			const serialNumber = alreadyBookedSlots + 1
			const joiningTime = addMinutes(appointment.schedule.startDateTime, (serialNumber - 1 ) * 20)
			await tx.appointment.update({
				where: {
					id: result.merchantInvoiceNumber,

				},
				data: {
					status: AppointmentStatus.CONFIRMED,
					joiningTime,
					serialNumber
				},
			});
			await prisma.schedule.update({
				where:{
					id: appointment.schedule.id
				},
				data:{
					availableSlots: newAvailableSlots
				}
			})
			await tx.payment.update({
				where: {
					appointmentId: result.merchantInvoiceNumber,
				},
				data: {
					status: PaymentStatus.PAID,
					bkashTrxId: result.trxID,
					paidAt: result.paymentExecuteTime,
					gatewayResponse: result,
				},
			});
			// generate PDF here

			const pdfDocument = new PDFDocument({ margin : 50});

			const pdfChunks : Buffer[] = []

			pdfDocument.on("data", (chunk : Buffer) => {
				pdfChunks.push(chunk)
			})

			const pdfReadyPromise = new Promise<Buffer>((resolve)=>{
				pdfDocument.on("end", () => {
					resolve(Buffer.concat(pdfChunks))
				})
			})

			pdfDocument.fontSize(20).text("PH Healthcare System", {align : "center"});
			pdfDocument.fontSize(14).text("Appointment Invoice", { align: "center" });
			pdfDocument.moveDown(2)

			pdfDocument.fontSize(12).text(`Patient Name: ${appointment.patient?.name}`);
			pdfDocument.text(`Patient Email: ${appointment.patient?.email}`);
			pdfDocument.moveDown();

			pdfDocument.text(`Doctor Name: ${appointment.doctor?.name}`);
			pdfDocument.text(`Specialization: ${appointment.doctor?.specialization}`);
			pdfDocument.moveDown();

			pdfDocument.text(
				`Appointment Date: ${appointment.schedule.startDateTime.toDateString()}`,
			);
			pdfDocument.text(`Your Joining Time: ${joiningTime.toString()}`);
			pdfDocument.text(`Your Serial Number: ${serialNumber}`);
			pdfDocument.text(`Meeting Link: ${appointment.schedule.meetingLink}`);
			pdfDocument.moveDown();

			pdfDocument.text(`Amount Paid: ${result.amount} BDT`);
			pdfDocument.text(`Payment Method: bKash`);
			pdfDocument.text(`Transaction Id: ${result.trxID}`);
			pdfDocument.text(`Paid At: ${result.paymentExecuteTime}`);

			pdfDocument.end()

			const pdfBuffer = await pdfReadyPromise;

			await transporter.sendMail({
				from: config.send_email,
				to: appointment.patient.email,
				subject: "Your Appointment Invoice - PH HealthCare System",
				text: "Thank you for booking an appointment. Please find your invoice attached",
				attachments: [
					{
						filename: `${appointment.patient.name}_invoice.pdf`,
						content: pdfBuffer
					}
				]
			})
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
			};
		} else if (status === "failure") {
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentId,
				},
				data: {
					status: PaymentStatus.FAILED,
					gatewayResponse: result,
				},
			});
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
			};
		} else if (status === "cancel") {
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentId,
				},
				data: {
					status: PaymentStatus.CANCELLED,
					gatewayResponse: result,
				},
			});
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
			};
		} else {
			return {
				result,
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
			};
		}
	});

	return transaction;
};

const cancelAppointment = async (payload: any, user: RequestUser) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const appointmentId = payload.appointmentId;

		const existingAppointment = await tx.appointment.findUnique({
			where: {
				id: appointmentId,
			},
			include: {
				payments: true,
			},
		});
		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash access token found");
		}

		const getBkashHeaders = () => ({
			"Content-Type": "application/json",
			Accept: "application/json",
			Authorization: bkashIdToken,
			"X-App-Key": config.bkash_app_key,
		});

		if (!existingAppointment) {
			throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
		}

		if (
			existingAppointment.status === "ONGOING" ||
			existingAppointment.status === "COMPLETED" ||
			existingAppointment.status === "CANCELLED"
		) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				`Your Appointment is Already ${existingAppointment.status}`,
			);
		}

		const updateAppointment = await tx.appointment.update({
			where: {
				id: existingAppointment.id,
			},
			data: {
				status: "CANCELLED",
			},
		});

		const bkashRefundPayment = await fetch(
			`${config.bkash_sandbox_base_url}/v2/tokenized-checkout/refund/payment/transaction`,

			{
				method: "POST",
				headers: getBkashHeaders(),
				body: JSON.stringify({
					paymentID: existingAppointment?.payments?.bkashPaymentId,
					trxID: existingAppointment?.payments?.bkashTrxId,
					amount: existingAppointment?.payments?.amount.toString(),
					sku: "test",
					reason: "Patient Cancel the appointment",
				}),
			},
		);

		const refundResponse = await bkashRefundPayment.json();

		const updatedPayment = await tx.payment.update({
			where: {
				appointmentId: existingAppointment.id,
			},
			data: {
				refundTrxId: refundResponse.refundTrxID,
				refundedAt: refundResponse.completedTime,
				refundAmount: refundResponse.amount,
				refundReason: "Patient Cancel the appointment",
				status: PaymentStatus.REFUNDED,
				gatewayResponse: refundResponse,
			},
		});

		return {
			appointment: updateAppointment,
			payment: updatedPayment,
		};
	});
	return transactionResult;
};

export const appointmentsServices = {
	createNewBooking,
	bookingAppointmentCallback,
	payAppointment,
	cancelAppointment,
};
