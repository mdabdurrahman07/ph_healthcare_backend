import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";

const createNewBooking = async () => {
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
        // agreementID: "TokenizedMerchant01L3IKB6H1565072174987", //appointment_id
        mode: "0011",
        payerReference: "01723888888", // user email
        callbackURL:
          "http://localhost:5000/api/v1/appointment/book-appointment/payment/callback",
        merchantAssociationInfo: "MI05MID54RF09123456One",
        amount: "120000",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: "Inv0124",
      }),
    },
  );

  const bkashCreatePaymentResult = await bkashCreatePayment.json();

  return bkashCreatePaymentResult;
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
  if(status === "success"){
    return{
      result,
      redirectUrl : `${config.frontend_url}/dashboard/my-appointment?status=success`
    }
  }
  if(status === "failure"){
    return{
      result,
      redirectUrl : `${config.frontend_url}/dashboard/my-appointment?status=failure`
    }
  }
   if(status === "cancel"){
    return{
      result,
      redirectUrl : `${config.frontend_url}/dashboard/my-appointment?status=cancel`
    }
  }
  return {
    result,
      redirectUrl : `${config.frontend_url}/dashboard/my-appointment`
  }
};

export const appointmentsServices = {
  createNewBooking,
  bookingAppointmentCallback,
};
