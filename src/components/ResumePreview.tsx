"use client";

import type { ResumeContent } from "@/lib/generate";
import { displayUrl } from "@/lib/links";
import { resumeHeadline } from "@/lib/headline";
import { atsSpec, type AtsSpec } from "@/lib/designs";
import type { ReactNode } from "react";

// Documents use inline colours: the dark theme remaps Tailwind colour classes, but documents are always print colours.
const plainText = (v: string) => (v || "").replace(/\*\*/g, "");

function range(start: string, end: string) {
  const f = (ym: string) => {
    if (!ym) return "";
    const [y, m] = ym.split("-").map(Number);
    return m ? new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" }) : String(y);
  };
  return [f(start), end ? f(end) : "Present"].filter(Boolean).join(" - ");
}

/* ------------------------------------------------- resume prompt layout (every design) */

/** Points → CSS pixels, so the preview uses the DOCX / PDF type sizes. */
const px = (pt: number) => Math.round(pt * (4 / 3) * 10) / 10;

function atsSkillLines(r: ResumeContent) {
  const groups = r.skills.filter((g) => g.items?.length);
  if (groups.length === 1 && !groups[0].category?.trim()) return [{ label: "", items: groups[0].items.join(", ") }];
  return groups.map((g) => ({ label: (g.category || "").trim(), items: g.items.join(", ") }));
}

function AtsHeader({ r, a, headline = true, letter = false }: { r: ResumeContent; a: AtsSpec; headline?: boolean; letter?: boolean }) {
  const L = a.resume;
  const contact = [r.contact.location, r.contact.phone, r.contact.email, displayUrl(r.contact.linkedin)].filter(Boolean).join("  |  ");
  return (
    <div style={{ textAlign: a.align }}>
      <div style={{ fontSize: letter ? 25 : px(L.name), fontWeight: 700, lineHeight: 1.15 }}>{r.fullName}</div>
      {headline && <div style={{ fontSize: px(L.headline), marginTop: 2 }}>{resumeHeadline(r)}</div>}
      {contact && <div style={{ fontSize: letter ? 12 : px(L.contact), marginTop: 2, whiteSpace: "pre-wrap" }}>{contact}</div>}
    </div>
  );
}

function AtsHeading({ a, first, children }: { a: AtsSpec; first: boolean; children: ReactNode }) {
  const L = a.resume;
  return (
    <h3
      style={{
        margin: `${px(first ? L.firstSectionBefore : L.sectionBefore)}px 0 ${px(L.sectionAfter + 2)}px`,
        paddingBottom: 2,
        borderBottom: `1px solid #${L.rule}`,
        fontSize: px(L.heading),
        fontWeight: 700,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </h3>
  );
}

/** ATS-safe US resume: mirrors the ATS DOCX / PDF (lib/documents.ts). */
export function AtsResume({ r, a }: { r: ResumeContent; a: AtsSpec }) {
  const L = a.resume;
  const skills = atsSkillLines(r);
  const eduDate = (e: ResumeContent["education"][number]) => (e.endDate ? range("", e.endDate).replace(/^ - /, "") : range(e.startDate, e.endDate));
  const order = [r.summary && "summary", skills.length && "skills", r.experience.length && "experience", r.projects?.length && "projects", r.education.length && "education"].filter(Boolean);
  const H = ({ id }: { id: keyof AtsSpec["resume"]["sections"] }) => (
    <AtsHeading a={a} first={order[0] === id}>
      {L.sections[id]}
    </AtsHeading>
  );
  return (
    <div className="text-left" style={{ fontFamily: a.cssFont, color: "#000", fontSize: px(L.body), lineHeight: 1.32 }}>
      <AtsHeader r={r} a={a} />
      <div style={{ borderBottom: `1px solid #${L.rule}`, marginTop: 4 }} />
      {r.summary && (
        <>
          <H id="summary" />
          <p>{plainText(r.summary)}</p>
        </>
      )}
      {!!skills.length && (
        <>
          <H id="skills" />
          {skills.map((s, i) => (
            <div key={i}>
              {s.label && <b>{s.label}: </b>}
              {s.items}
            </div>
          ))}
        </>
      )}
      {!!r.experience.length && (
        <>
          <H id="experience" />
          {r.experience.map((e, i) => (
            <div key={i} style={{ marginTop: i ? px(L.entryGap) : 0 }}>
              <div style={{ fontSize: px(L.title), fontWeight: 700 }}>{e.title}</div>
              <div style={{ fontSize: px(L.meta) }}>{[e.company, e.location, range(e.startDate, e.endDate)].filter(Boolean).join(" | ")}</div>
              {e.description && <p style={{ marginTop: 3 }}>{plainText(e.description)}</p>}
              <AtsBullets items={e.bullets} a={a} />
            </div>
          ))}
        </>
      )}
      {!!r.projects?.length && (
        <>
          <H id="projects" />
          {r.projects.map((p, i) => (
            <div key={i} style={{ marginTop: i ? px(L.entryGap) : 0 }}>
              <div style={{ fontSize: px(L.title) }}>
                <b>{p.name}</b>
                {!!p.techStack?.length && <i>{`  |  ${p.techStack.join(", ")}`}</i>}
              </div>
              {p.description && <p>{plainText(p.description)}</p>}
              <AtsBullets items={p.bullets} a={a} />
            </div>
          ))}
        </>
      )}
      {!!r.education.length && (
        <>
          <H id="education" />
          {r.education.map((e, i) => (
            <div key={i} style={{ marginTop: i ? 2 : 0 }}>
              <b>{e.university}</b>
              {[[e.degree, e.field].filter(Boolean).join(", "), eduDate(e)].filter(Boolean).map((x) => ` | ${x}`).join("")}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function AtsBullets({ items, a }: { items: string[]; a: AtsSpec }) {
  if (!items?.length) return null;
  return (
    <ul style={{ marginTop: 2, paddingLeft: 18, listStyle: "disc", fontSize: px(a.resume.bullet) }}>
      {items.map((b, j) => (
        <li key={j} style={{ marginTop: px(a.resume.bulletAfter) }}>
          {b.replace(/\*\*/g, "")}
        </li>
      ))}
    </ul>
  );
}

/** ATS-safe US business letter: letterhead, date, recipient, subject line, then the letter text. */
export function AtsLetter({ r, a, date, text, company, jobTitle, jobLocation }: { r: ResumeContent; a: AtsSpec; date: string; text: string; company?: string; jobTitle?: string; jobLocation?: string }) {
  const recipient = ["Hiring Team", company, jobLocation].filter(Boolean);
  const paras = (text || "").replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="text-left text-[14px] leading-[1.5]" style={{ fontFamily: a.cssFont, color: "#000" }}>
      <AtsHeader r={r} a={a} headline={false} letter />
      <div style={{ borderBottom: `1px solid #${a.resume.rule}`, marginTop: 8 }} />
      <div style={{ margin: "22px 0 16px" }}>{date}</div>
      <div style={{ marginBottom: 16 }}>
        {recipient.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
      {jobTitle && <div style={{ fontWeight: 700, marginBottom: 16 }}>Re: {jobTitle}</div>}
      {paras.map((p, i) => (
        <p key={i} style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>
          {p}
        </p>
      ))}
    </div>
  );
}

/** Cover letter preview for any design (all render as the US business letter). */
export function LetterPreview({
  r,
  design,
  text,
  date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  company,
  jobTitle,
  jobLocation,
}: {
  r: ResumeContent;
  design?: string | null;
  text: string;
  date?: string;
  company?: string;
  jobTitle?: string;
  jobLocation?: string;
}) {
  return (
    <div className="paper mx-auto max-w-3xl p-2" style={{ background: "#fff" }}>
      <AtsLetter r={r} a={atsSpec(design)} date={date} text={text} company={company} jobTitle={jobTitle} jobLocation={jobLocation} />
    </div>
  );
}

/** Mirrors the generated DOCX/PDF for the given design. */
export default function ResumePreview({ r, design }: { r: ResumeContent; design?: string | null }) {
  return (
    <div className="paper mx-auto max-w-3xl p-2" style={{ background: "#fff" }}>
      <AtsResume r={r} a={atsSpec(design)} />
    </div>
  );
}
