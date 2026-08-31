import type { DoctorVerificationStatus } from "../../../../generated/enums";

export interface IDoctor {
	doctor: {
		specialization: string;
		licenseNumber: string;
		qualificationYears: number;
		qualifications: string;
		consultationFee: number;
		contactNumber: string;
		bio?: string;
		address?: string;
	};
	user: {
		name: string;
		email: string;
		password: string;
	};
}

export interface IDoctorVerificationPayload {
	email: string;
	otp: string;
}

export interface IApproveDoctorPayload {
	doctorId: string;
	verificationStatus: DoctorVerificationStatus;
	rejectionReason?: string;
}

export interface IUpdateDoctorProfilePayload {
    address?: string;
    bio?: string;
    consultationFee?: number;
    contactNumber?: string;
}
