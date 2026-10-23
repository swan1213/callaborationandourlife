import { HttpError } from "./auth";
import { resolveOpenAI, recordKeyResult } from "./openaiKeys";
import { normalizeUrl, URL_FIELDS } from "./links";

export const MAX_RESUME_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request limit

/** Plain text from an uploaded PDF, DOCX or TXT resume. */
export async function resumeFileToText(file: File): Promise<string> {
  if (file.size > MAX_RESUME_BYTES) throw new HttpError(413, "Resume file must be 4 MB or smaller");
  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return value;
  }
  if (name.endsWith(".txt") || file.type.startsWith("text/")) return new TextDecoder().decode(buf);
  throw new HttpError(415, "Upload a PDF, DOCX or TXT resume");
}

const SYSTEM = `You extract structured candidate data from a resume for an HR system.
Rules:
- Copy facts exactly as written; never invent data. Use "" (or []) for anything not present.
- Dates as "YYYY-MM" only when the resume shows a month. If it shows only a year, return exactly "YYYY" (never invent a month such as "-01"). A current role has current=true and endDate="".
- Experience most recent first. "description" holds that role's bullet points, one per line, without bullet symbols.
- Split the name into firstName and lastName.
- Normalise tech names (C#, C++, .NET, Node.js, PostgreSQL).
Respond with one JSON object only.`;

const SHAPE = `{
  "firstName": string, "lastName": string, "email": string, "phone": string,
  "linkedin": string, "github": string, "website": string, "portfolio": string,
  "street": string, "city": string, "state": string, "zipcode": string,
  "currentCompany": string,
  "summary": string,
  "skills": string[],
  "certifications": string[],
  "experience": [{ "company": string, "title": string, "location": string, "startDate": string, "endDate": string, "current": boolean, "description": string }],
  "education": [{ "university": string, "degree": string, "field": string, "startDate": string, "endDate": string }]
}`;

export type ExtractedProfile = Record<string, unknown>;

export async function extractProfileFromResume(text: string): Promise<ExtractedProfile> {
  const clean = text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length < 100) throw new HttpError(422, "Could not read enough text from the resume (is it a scanned image?)");

  const openai = await resolveOpenAI({});
  let raw: string;
  try {
    const res = await openai.client.chat.completions.create({
      model: openai.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Return JSON with exactly this shape:\n${SHAPE}\n\nRESUME:\n"""\n${clean.slice(0, 30000)}\n"""` },
      ],
    });
    raw = res.choices[0]?.message?.content ?? "{}";
    await recordKeyResult(openai.apiKeyId);
  } catch (e) {
    const msg = `OpenAI error: ${e instanceof Error ? e.message : "request failed"}`;
    await recordKeyResult(openai.apiKeyId, msg);
    throw new HttpError(502, msg);
  }

  let out: Record<string, unknown>;
  try {
    out = JSON.parse(raw);
  } catch {
    throw new HttpError(502, "The AI returned an invalid response. Please try again.");
  }

  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const ym = (v: unknown) => {
    const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(s(v));
    return m ? (m[2] ? `${m[1]}-${m[2].padStart(2, "0")}` : m[1]) : "";
  };
  const texts = [
    "firstName", "lastName", "email", "phone", "linkedin", "github", "website", "portfolio",
    "street", "city", "state", "zipcode", "currentCompany", "summary",
  ];
  // Resumes often print the name in capitals; store it as "John Smith".
  const nameCase = (v: string) =>
    v && v === v.toUpperCase() ? v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase()) : v;
  const fields = Object.fromEntries(texts.map((k) => [k, s(out[k])]));
  fields.firstName = nameCase(fields.firstName);
  fields.lastName = nameCase(fields.lastName);
  for (const k of URL_FIELDS) fields[k] = normalizeUrl(fields[k]);
  // A single-word name still needs both parts to save.
  if (fields.firstName && !fields.lastName && fields.firstName.includes(" ")) {
    const [first, ...rest] = fields.firstName.split(/\s+/);
    fields.firstName = first;
    fields.lastName = rest.join(" ");
  }
  return {
    ...fields,
    skills: arr(out.skills).map(s).filter(Boolean),
    certifications: arr(out.certifications).map(s).filter(Boolean),
    experience: arr(out.experience)
      .map((e: Record<string, unknown>) => ({
        company: s(e?.company),
        title: s(e?.title),
        location: s(e?.location),
        startDate: ym(e?.startDate),
        endDate: e?.current ? "" : ym(e?.endDate),
        current: !!e?.current,
        description: s(e?.description),
      }))
      .filter((e) => e.company),
    education: arr(out.education)
      .map((e: Record<string, unknown>) => ({
        university: s(e?.university),
        degree: s(e?.degree),
        field: s(e?.field),
        startDate: ym(e?.startDate),
        endDate: ym(e?.endDate),
      }))
      .filter((e) => e.university),
  };
}
