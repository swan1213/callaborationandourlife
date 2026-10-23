import { v2 as cloudinary } from "cloudinary";
import { HttpError } from "./auth";

function configured() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET)
    throw new HttpError(500, "Cloudinary is not configured");
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  return { cloudName: CLOUDINARY_CLOUD_NAME, apiKey: CLOUDINARY_API_KEY, apiSecret: CLOUDINARY_API_SECRET };
}

export const SCREENSHOT_FOLDER = `${process.env.CLOUDINARY_ROOT_FOLDER || "tailorbid"}/screenshots`;

/** Signature for a direct browser → Cloudinary upload (bypasses Vercel's 4.5 MB body limit). */
export function signUpload(folder: string) {
  const { cloudName, apiKey, apiSecret } = configured();
  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder, timestamp };
  const signature = cloudinary.utils.api_sign_request(params, apiSecret);
  return { cloudName, apiKey, timestamp, folder, signature };
}

export async function destroyAsset(publicId: string) {
  configured();
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (e) {
    console.error("Cloudinary destroy failed", e);
  }
}

export function isOurCloudinaryUrl(url: string) {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  return !!name && url.startsWith(`https://res.cloudinary.com/${name}/`);
}
