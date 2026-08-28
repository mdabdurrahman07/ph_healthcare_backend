import { AppointmentStatus, PaymentStatus, ScheduleStatus } from "../../../../generated/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";
import { IBookAppointmentPayload } from "./appointment.interface";
import { isBefore, isSameDay } from "date-fns";

const createNewBooking = async (payload: IBookAppointmentPayload, user: RequestUser) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const patient = await prisma.patient.findUnique({
			where:{
				userId: user.userId
			}
		})
		if(!patient){
			throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found")
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

		const now = new Date()

		if(!isSameDay(now, schedule.startDateTime)){
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Is Not Available Today",
			);
		}

		if(!isBefore(now, schedule.startDateTime)){
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"This Schedule Has Already Started",
			);
		}
		// can't take same appointment in single day
		const existingAppointment = await prisma.appointment.findFirst({
			where:{
				patientId: patient.id,
				scheduleId: schedule.id,
				// status:{
				// 	not: AppointmentStatus.CANCELLED
				// }
			}
		})
		if(existingAppointment?.status === AppointmentStatus.PENDING){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have A Pending Appointment")

		}
		if(existingAppointment?.status === AppointmentStatus.CONFIRMED){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have A Confirmed Appointment")

		}
		if(existingAppointment?.status === AppointmentStatus.ONGOING){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have A Ongoing Appointment")

		}
		if(existingAppointment?.status === AppointmentStatus.COMPLETED){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have A Completed Appointment On This Schedule. Please Try Again Another Day")

		}
		if(schedule.availableSlots === 0){
			throw new AppError(httpStatus.BAD_REQUEST, "This Schedule Is Fully Booked")
		}
		if(!schedule.doctor.consultationFee){
			throw new AppError(httpStatus.BAD_REQUEST, "Doctor Has Not Set A Consultation Fee Yet")
		}

		const amount = schedule.doctor.consultationFee.toString()

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

const payAppointment = async (payload: any, user: RequestUser) => {
	const appointmentId = payload.appointmentId;
	const existingAppointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
		},
	});

	if (!existingAppointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if (existingAppointment.status !== "PENDING") {
		throw new AppError(httpStatus.BAD_REQUEST, "No Pending Bookings");
	}

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
				amount: "1200",
				currency: "BDT",
				intent: "sale",
				// merchantInvoiceNumber: "Inv4", // apppointment id
				merchantInvoiceNumber: existingAppointment.id, // apppointment id
			}),
		},
	);

	const bkashCreatePaymentResult = await bkashCreatePayment.json();

	const payment = await prisma.payment.update({
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
			await tx.appointment.update({
				where: {
					id: result.merchantInvoiceNumber,
				},
				data: {
					status: AppointmentStatus.CONFIRMED,
				},
			});
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
