import z from "zod";

export const patientRegistrationSchema = z.object({
    name: z.string().min(3),
    email: z.email(),
    password: z.string().min(6),
    patient: z.object({
        contactNumber: z.string().optional()
    }).optional()
})