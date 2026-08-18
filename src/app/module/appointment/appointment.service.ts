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

const bookingAppointmentCallback = () =>{
    return {
        success: true
    }
}

export const appointmentsServices = {
  createNewBooking,
  bookingAppointmentCallback
};
