import { uploadOnCloudinary } from "../../lib/cloudinary";

const uploadProfileImage = async (buffer: Buffer) => {
  if (!buffer) {
    throw new Error("No file buffer provided for profile image upload");
  }

  const uploadedImageUrl = await uploadOnCloudinary(buffer, {folder: "profileImages"});
  return uploadedImageUrl;
};

export const userServices = {
  uploadProfileImage,
};
