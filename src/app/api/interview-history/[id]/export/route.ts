import { handler } from "@/lib/auth";
import { loadSession, toMarkdown, type SessionDoc } from "@/lib/interviewSessions";

/** GET — the recording as a Markdown file. */
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await loadSession((await params).id);
  const name = [s.company || "Interview", s.role, new Date(s.startedAt).toISOString().slice(0, 10)].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]/g, "");
  return new Response(toMarkdown(s.toObject() as unknown as SessionDoc), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}.md"; filename*=UTF-8''${encodeURIComponent(name)}.md`,
      "Cache-Control": "no-store",
    },
  });
});
