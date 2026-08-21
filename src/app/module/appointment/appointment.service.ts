import { AppointmentStatus } from "../../../../generated/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";

const createNewBooking = async (payload: any, user: RequestUser) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
      },
    });

    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new Error("No Bkash access token found");
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
          merchantInvoiceNumber: appointment.id, // apppointment id
        }),
      },
    );

    const bkashCreatePaymentResult = await bkashCreatePayment.json();

    console.log(bkashCreatePaymentResult, "bkashCreatePaymentResult");

    // payment model business logic

    await tx.payment.create({
      data: {
        merchantInvoiceNumber: appointment.id,
        appointmentId: appointment.id,
        amount: "1200",
        gatewayResponse: bkashCreatePaymentResult,
        bkashPaymentId: bkashCreatePaymentResult.paymentID
      },
    });

    return {
      paymentUrl: bkashCreatePaymentResult.bkashURL,
    };
  });

  return transactionResult;
};

const bookingAppointmentCallback = async (query: Record<string, any>) => {
  const paymentId = query.paymentID;
  if (!paymentId) {
    throw new Error("Payment Id Missing");
  }
  const status = query.status;
  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new Error("No Bkash access token found");
  }

  const getBkashHeaders = () => ({
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: bkashIdToken,
    "X-App-Key": config.bkash_app_key,
  });
  if (!status) {
    throw new Error("Payment Status Missing");
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
    return {
      result,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointment?status=success`,
    };
  }
  if (status === "failure") {
    return {
      result,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointment?status=failure`,
    };
  }
  if (status === "cancel") {
    return {
      result,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointment?status=cancel`,
    };
  }
  return {
    result,
    redirectUrl: `${config.frontend_url}/dashboard/my-appointment`,
  };
};

export const appointmentsServices = {
  createNewBooking,
  bookingAppointmentCallback,
};
