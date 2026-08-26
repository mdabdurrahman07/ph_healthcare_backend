import cron from "node-cron";
import { prisma } from "./prisma";
import { Role } from "../../../generated/enums";

export const deleteUnverifiedDoctors = async () => {
  cron.schedule("*/10 * * * *", async () => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const deletedDoctors = await prisma.user.deleteMany({
        where:{
            role: Role.DOCTOR,
            emailVerified: false,
            createdAt: {lt: oneHourAgo}
        }
    })

    if(deletedDoctors.count > 0){
        console.log(`
            Cron: Deleted ${deletedDoctors.count} unverified email doctor application older than 1 hour`)
    }
    } catch (error: unknown) {
        if(error instanceof Error){
            console.log("Cron Failed to delete unverified doctor applications", error)
        }
        
    }
  });
  console.log("Doctor Delete cron schedule (Every 10 minutes)")
};
