import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

import config from "../config";

cloudinary.config({
	cloud_name: config.cloudinary_cloud_name,
	api_key: config.cloudinary_api_key,
	api_secret: config.cloudinary_api_secret,
});

export type CloudinaryFolder =
	| "profileImages"
	| "serviceImages"
	| "categoryImages"
	| "doctorDocuments";

export type CloudinaryResourceType = "auto" | "image" | "video" | "raw";

interface UploadOptions {
	folder?: CloudinaryFolder;
	resource_type?: CloudinaryResourceType;
	public_id?: string;
	use_filename?: boolean;
	unique_filename?: boolean;
}

export const uploadOnCloudinary = async (
	buffer: Buffer,
	options: UploadOptions = {},
): Promise<UploadApiResponse> => {
	const {
		folder,
		resource_type = "auto",
		public_id,
		use_filename,
		unique_filename,
	} = options;

	const result: UploadApiResponse = await new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{
				resource_type,
				folder,
				public_id,
				use_filename,
				unique_filename,
			},
			(error, result) => {
				if (error) {
					return reject(new Error(error.message));
				}

				if (!result) {
					return reject(new Error("File upload failed on Cloudinary"));
				}

				resolve(result);
			},
		);

		uploadStream.end(buffer);
	});

	return result;
};

export const deleteFromCloudinary = async (
	publicId: string,
	resourceType: "image" | "video" | "raw" = "image",
) => {
	return await cloudinary.uploader.destroy(publicId, {
		resource_type: resourceType,
		invalidate: true,
	});
};

export const uploadDocumentOnCloudinary = async (file: Express.Multer.File) => {
	const isPdf = file.mimetype === "application/pdf";

	const result = await uploadOnCloudinary(file.buffer, {
		folder: "doctorDocuments",
		resource_type: isPdf ? "image" : "raw",
		use_filename: true,
		unique_filename: true,
	});

	return {
		publicId: result.public_id,
		url: result.secure_url,
		resourceType: result.resource_type,
		format: result.format,
		originalName: file.originalname,
		size: file.size,
		mimeType: file.mimetype,
	};
};

export const uploadDocumentsOnCloudinary = async (
	files: Express.Multer.File[],
) => {
	return Promise.all(files.map((file) => uploadDocumentOnCloudinary(file)));
};
