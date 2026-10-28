import { NextResponse } from "next/server";
import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { documentToText, MAX_RESUME_BYTES } from "@/lib/resumeExtract";
import { oid } from "@/lib/query";

export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/** Characters of an attached document kept for the chat (the chat route caps them again). */
const MAX_TEXT = 20000;

/**
 * Multipart `file` (PDF, DOCX, TXT, MD, CSV, JSON) → { name, text }
 * A document attached in an application's interview chat (components/InterviewChat.tsx): its text is returned to the
 * page, which sends it with the question. Nothing is stored.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const app = await Application.findById(oid((await params).id)).select("user profile deletedByUser").lean();
  const isOwner = app && String(app.user) === String(user._id) && !app.deletedByUser;
  const isRep = app && user.role === "user" && canManageProfile(user, app.profile);
  if (!app || (!isOwner && !isRep && user.role !== "admin")) throw new HttpError(404, "Application not found");

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file");
  if (file.size > MAX_RESUME_BYTES) throw new HttpError(413, "Files must be 4 MB or smaller");
  const text = await documentToText(file).catch(() => {
    throw new HttpError(422, `Couldn't read "${file.name}". Try saving it as PDF or TXT.`);
  });
  if (text === null) throw new HttpError(415, "Attach an image, PDF, Word (.docx) or text file");
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) throw new HttpError(422, `"${file.name}" has no text to read (a scanned PDF?). Attach it as an image instead.`);
  return NextResponse.json({ name: file.name, text: clean.slice(0, MAX_TEXT), truncated: clean.length > MAX_TEXT });
});
