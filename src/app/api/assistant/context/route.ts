import { NextResponse } from "next/server";
import { handler } from "@/lib/auth";
import { requireAssistant, resumeToText } from "@/lib/assistant";
import { candidateProfileText, type ResumeContent } from "@/lib/generate";
import { Application } from "@/lib/models/Application";
import { Profile, type ProfileFields } from "@/lib/models/Profile";

/**
 * GET — what the local Interview Assistant needs for its interview (Bearer assistant token):
 * the tailored resume of the interview's application (or the profile's base resume) and the job description.
 */
export const GET = handler(async (req: Request) => {
  const { user, interview: i } = await requireAssistant(req);
  if (!i) return NextResponse.json({ user: { name: user.name }, interview: null, resume: "", jobDescription: "" });

  const [app, profile] = await Promise.all([
    i.application ? Application.findById(i.application).select("resume jobDescription jobLocation company jobTitle").lean() : null,
    Profile.findById(i.profile).lean(),
  ]);
  const resume = app?.resume ? resumeToText(app.resume as ResumeContent) : profile ? candidateProfileText(profile as unknown as ProfileFields) : "";
  const company = i.company || app?.company || "";
  const jobTitle = i.jobTitle || app?.jobTitle || "";
  const header = [company && `Company: ${company}`, jobTitle && `Role: ${jobTitle}`, app?.jobLocation && `Location: ${app.jobLocation}`].filter(Boolean).join("\n");

  return NextResponse.json(
    {
      user: { name: user.name },
      interview: {
        id: String(i._id),
        company,
        jobTitle,
        step: i.step ?? 1,
        scheduledAt: i.scheduledAt ?? null,
        candidate: profile?.fullName ?? i.profileLabel ?? "",
      },
      resume,
      jobDescription: [header, app?.jobDescription?.trim()].filter(Boolean).join("\n\n"),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
});
