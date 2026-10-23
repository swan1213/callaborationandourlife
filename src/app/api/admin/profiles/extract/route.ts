import { NextResponse } from "next/server";
import { handler, HttpError, requireStaff } from "@/lib/auth";
import { extractProfileFromResume, resumeFileToText } from "@/lib/resumeExtract";

export const maxDuration = 60;

/** Multipart `file` (PDF/DOCX/TXT) or JSON `{ text }` → extracted profile fields for review in the editor, plus the resume text. */
export const POST = handler(async (req: Request) => {
  await requireStaff();
  let text = "";
  let fileName = "";
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a resume file");
    text = await resumeFileToText(file);
    fileName = file.name;
  } else {
    text = String((await req.json()).text || "");
  }
  // The text is also returned so the editor can keep it as the profile's reference resume.
  return NextResponse.json({ profile: await extractProfileFromResume(text), text: text.slice(0, 30000), fileName });
});
