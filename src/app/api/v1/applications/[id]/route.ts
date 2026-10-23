import { handler } from "@/lib/auth";
import { apiJson, applicationOut, requireAccessKey } from "@/lib/apiAccess";
import { documentFile, loadApplicationDocs } from "@/lib/apiFiles";
import { oid } from "@/lib/query";
import type { AppDocSource } from "@/lib/documents";

export const maxDuration = 60;

/** GET /api/v1/applications/:id — a generated resume, cover letter and job description. ?format=json (default) | pdf | docx | jd-docx */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAccessKey(req);
  const app = await loadApplicationDocs(oid((await params).id, "application"));
  const f = await documentFile(app as unknown as AppDocSource, new URL(req.url).searchParams.get("format"));
  return f ?? apiJson({ application: applicationOut(app as never) });
});
