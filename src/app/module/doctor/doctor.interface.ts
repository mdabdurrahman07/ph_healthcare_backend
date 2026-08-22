import { DoctorVerificationStatus } from "../../../../generated/enums";

export interface IDoctor {
  doctor: {
    specialization: string;
    licenseNumber: string;
    qualificationYears: number;
    qualifications: string;
    consultationFee: number;
    contactNumber: string;
  };
  user: {
    name: string;
    email: string;
	password: string
  };
}
