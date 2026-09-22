import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadBufferToCloudinary = (
  buffer: Buffer,
  options: UploadApiOptions
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) {
        reject(error || new Error("Cloudinary upload failed with empty result"));
      } else {
        resolve(result);
      }
    });
    stream.end(buffer);
  });
};

export const getPublicIdFromUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    const segments = url.split("/");
    const lastSegment = segments.pop();
    if (!lastSegment) return null;
    return lastSegment.split(".")[0];
  } catch {
    return null;
  }
};

export const deleteFromCloudinary = async (publicId: string): Promise<unknown> => {
  if (!publicId) return null;
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error(`Failed to delete Cloudinary asset ${publicId}:`, err);
    return null;
  }
};

export default cloudinary;
