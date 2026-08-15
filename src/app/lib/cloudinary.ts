import { v2 as cloudinary } from "cloudinary";
import config from "../config";

cloudinary.config({
  cloud_name: config.cloudinary_cloud_name,
  api_key: config.cloudinary_api_key,
  api_secret: config.cloudinary_api_secret,
});

export type CloudinaryFolder =
  | "profileImages"
  | "serviceImages"
  | "categoryImages";

interface UploadOptions {
  folder?: CloudinaryFolder;
  resource_type?: "auto" | "image" | "video" | "raw";
}

export const uploadOnCloudinary = async (
  buffer: Buffer,
  options: UploadOptions = {}
): Promise<string> => {
  const { folder, resource_type = "auto" } = options;

  return new Promise<string>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type, folder },
      (error, result) => {
        if (error) return reject(new Error(error.message));
        if (!result?.secure_url) return reject(new Error("Cloudinary returned no URL"));
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
};