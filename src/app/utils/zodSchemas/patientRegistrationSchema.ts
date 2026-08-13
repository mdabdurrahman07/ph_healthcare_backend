import z from "zod";

export const patientRegistrationSchema = z.object({
	name: z
		.string()
		.min(3, "your name must contain a minimum count of 3 alphabets"),
	email: z.email(),
	password: z
		.string()
		.min(
			6,
			"your password must contain a minimum count of six individual items",
		),
	patient: z
		.object({
			contactNumber: z.string().optional(),
		})
		.optional(),
});
