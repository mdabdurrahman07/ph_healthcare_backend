import nodemailer from "nodemailer";
import config from "../config";


export const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: config.google_app_smtp_user,
        pass: config.google_app_smtp_password,
    },
});