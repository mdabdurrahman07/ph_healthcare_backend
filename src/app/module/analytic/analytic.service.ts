import  httpStatus  from 'http-status';
import {
  AppointmentStatus,
  DoctorVerificationStatus,
  ScheduleStatus,
} from "../../../../generated/enums";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";

const getAdminAnalytics = async () => {
  const totalDoctors = await prisma.doctor.count({
    where: {
      isDeleted: false,
    },
  });
  const totalPendingDoctorApplications = await prisma.doctor.count({
    where: {
      isDeleted: false,
      verificationStatus: DoctorVerificationStatus.PENDING,
    },
  });

  const totalApprovedDoctors = await prisma.doctor.count({
    where: {
      isDeleted: false,
      verificationStatus: DoctorVerificationStatus.APPROVED,
    },
  });
  const totalRejectedDoctors = await prisma.doctor.count({
    where: {
      isDeleted: false,
      verificationStatus: DoctorVerificationStatus.REJECTED,
    },
  });

  const totalPatients = await prisma.patient.count({
    where: { isDeleted: false },
  });

  const totalAppointments = await prisma.appointment.count();

  const totalCompletedAppointments = await prisma.appointment.count({
    where: { status: AppointmentStatus.COMPLETED },
  });

  const totalCancelledAppointments = await prisma.appointment.count({
    where: { status: AppointmentStatus.CANCELLED },
  });

  return {
    totalDoctors,
    totalPendingDoctorApplications,
    totalApprovedDoctors,
    totalRejectedDoctors,
    totalPatients,
    totalAppointments,
    totalCompletedAppointments,
    totalCancelledAppointments,
  };
};
const getPatientAnalytics = async (user: RequestUser) => {
  const patient = await prisma.patient.findUnique({
    where: { userId: user.userId },
  });

  if (!patient) {
    throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
  }

  const totalAppointments = await prisma.appointment.count({
    where: { patientId: patient.id },
  });

  const upcomingAppointments = await prisma.appointment.count({
    where: { patientId: patient.id, status: AppointmentStatus.CONFIRMED },
  });

  const completedAppointments = await prisma.appointment.count({
    where: { patientId: patient.id, status: AppointmentStatus.COMPLETED },
  });

  const cancelledAppointments = await prisma.appointment.count({
    where: { patientId: patient.id, status: AppointmentStatus.CANCELLED },
  });

  return {
    totalAppointments,
    upcomingAppointments,
    completedAppointments,
    cancelledAppointments,
  };
};
const getDoctorAnalytics = async (user: RequestUser) => {
    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const totalSchedules = await prisma.schedule.count({
        where: { doctorId: doctor.id, isDeleted: false },
    });

    const publishedSchedules = await prisma.schedule.count({
        where: {
            doctorId: doctor.id,
            isDeleted: false,
            status: ScheduleStatus.PUBLISHED,
        },
    });

    const totalAppointments = await prisma.appointment.count({
        where: { doctorId: doctor.id },
    });

    const upcomingAppointments = await prisma.appointment.count({
        where: { doctorId: doctor.id, status: AppointmentStatus.CONFIRMED },
    });

    const ongoingAppointments = await prisma.appointment.count({
        where: { doctorId: doctor.id, status: AppointmentStatus.ONGOING },
    });

    const completedAppointments = await prisma.appointment.count({
        where: { doctorId: doctor.id, status: AppointmentStatus.COMPLETED },
    });

    const cancelledAppointments = await prisma.appointment.count({
        where: { doctorId: doctor.id, status: AppointmentStatus.CANCELLED },
    });

    return{
              totalSchedules,
        publishedSchedules,
        totalAppointments,
        upcomingAppointments,
        ongoingAppointments,
        completedAppointments,
        cancelledAppointments,
    }
};

export const analyticsServices = {
  getAdminAnalytics,
  getPatientAnalytics,
  getDoctorAnalytics,
};
