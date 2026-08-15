import { uploadOnCloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
  if (!buffer) {
    throw new Error("No file buffer provided for profile image upload");
  }

  const uploadedImage = await uploadOnCloudinary(buffer, {folder: "profileImages"});

  const updateUserProfileImage = await prisma.user.update({
	where:{
		id: userId
	},
	data:{
		profileImage: uploadedImage.secure_url,
    profileImagePublicId: uploadedImage.public_id
	}
  })
  return updateUserProfileImage
};

export const userServices = {
  uploadProfileImage,
};
