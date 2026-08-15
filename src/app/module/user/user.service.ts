import { deleteFromCloudinary, uploadOnCloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
	if (!buffer) {
		throw new Error("No file buffer provided for profile image upload");
	}

	const existingUser = await prisma.user.findUnique({
		where: {
			id: userId,
		},
		select: {
			profileImagePublicId: true,
		},
	});

	if (existingUser?.profileImagePublicId) {
		await deleteFromCloudinary(existingUser.profileImagePublicId);
	}

	const uploadedImage = await uploadOnCloudinary(buffer, {
		folder: "profileImages",
	});

	const updatedUser = await prisma.user.update({
		where: {
			id: userId,
		},
		data: {
			profileImage: uploadedImage.secure_url,
			profileImagePublicId: uploadedImage.public_id,
		},
	});

	return updatedUser;
};

export const userServices = {
	uploadProfileImage,
};
