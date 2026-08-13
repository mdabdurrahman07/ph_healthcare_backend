import z from "zod";

export const patientEmailVerificationSchema = z.object({
	email: z.email(),
	otp: z.string().length(6),
});
