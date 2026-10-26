import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { CHAT_FOLDER, signUpload, SCREENSHOT_FOLDER } from "@/lib/cloudinary";

/** POST { kind?: "chat" } — signature for one browser → Cloudinary upload: submission screenshots, or chat images. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const b = await req.json().catch(() => ({}));
  return NextResponse.json(signUpload(`${b?.kind === "chat" ? CHAT_FOLDER : SCREENSHOT_FOLDER}/${user._id}`));
});
