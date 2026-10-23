import { C, esc, layout, p, type Email } from "./emailTemplates";

/** Admin notification sent by email (the same message also appears in the app). */
export function messageEmail(o: { name: string; title: string; body: string; images: string[]; sender: string; url: string }): Email {
  const paragraphs = o.body
    .split(/\n{2,}/)
    .map((para) => p(esc(para).replace(/\n/g, "<br>")))
    .join("");
  const images = o.images
    .map(
      (u, i) =>
        `<a href="${esc(u)}" target="_blank" style="display:block;margin:0 0 12px"><img src="${esc(u.replace("/upload/", "/upload/c_limit,w_1072/"))}" alt="Attachment ${i + 1}" width="536" style="display:block;width:100%;max-width:536px;border:1px solid ${C.line};border-radius:10px"></a>`
    )
    .join("");
  const body = `${p(`Hi ${esc(o.name)},`)}
${paragraphs}
${images}
<p style="margin:18px 0 0;font-size:13px;color:${C.muted}">From ${esc(o.sender)}</p>`;
  return {
    subject: o.title,
    html: layout({ preheader: o.body.slice(0, 120), eyebrow: "Notification", title: o.title, body, cta: { label: "Open in TailorBid", href: o.url } }),
    text: `Hi ${o.name},\n\n${o.body}\n\n${o.images.join("\n")}\n\nFrom ${o.sender}\n${o.url}`,
  };
}

const CATEGORY: Record<string, string> = { bug: "Bug / problem", idea: "Idea / request", question: "Question", other: "Other" };

/** To every admin when someone sends feedback. */
export function feedbackEmail(o: { name: string; from: string; fromEmail: string; role: string; category: string; subject: string; message: string; images: string[]; url: string }): Email {
  const images = o.images
    .map((u, i) => `<a href="${esc(u)}" target="_blank" style="display:inline-block;margin:0 8px 8px 0"><img src="${esc(u.replace("/upload/", "/upload/c_limit,w_520/"))}" alt="Screenshot ${i + 1}" width="260" style="display:block;width:260px;max-width:100%;border:1px solid ${C.line};border-radius:8px"></a>`)
    .join("");
  const body = `${p(`Hi ${esc(o.name)},`)}
${p(`<strong>${esc(o.from)}</strong> (${esc(o.role)}, ${esc(o.fromEmail)}) sent feedback: <strong>${esc(CATEGORY[o.category] ?? o.category)}</strong>.`)}
${p(`<strong>${esc(o.subject)}</strong>`)}
${o.message ? p(esc(o.message).replace(/\n/g, "<br>")) : ""}
${images}`;
  return {
    subject: `Feedback from ${o.from}: ${o.subject}`,
    html: layout({ preheader: `${o.from}: ${o.subject}`, eyebrow: "New feedback", title: o.subject, body, cta: { label: "Open feedback", href: o.url } }),
    text: `${o.from} (${o.role}, ${o.fromEmail}) sent feedback (${CATEGORY[o.category] ?? o.category}):\n\n${o.subject}\n\n${o.message}\n\n${o.images.join("\n")}\n\n${o.url}`,
  };
}
