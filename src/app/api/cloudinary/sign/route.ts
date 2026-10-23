import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { signUpload, SCREENSHOT_FOLDER } from "@/lib/cloudinary";

export const POST = handler(async () => {
  const user = await requireUser();
  return NextResponse.json(signUpload(`${SCREENSHOT_FOLDER}/${user._id}`));
});
