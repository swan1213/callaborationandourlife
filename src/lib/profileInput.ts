import { HttpError } from "./auth";
import { Types } from "mongoose";
import { normalizeUrl, URL_FIELDS } from "./links";
import { isDesignId } from "./designs";
import { PROFILE_GROUP_TEXT_KEYS, SALARY_CURRENCIES, SALARY_PERIODS, WORK_SETUPS } from "./profileFields";

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map(s).filter(Boolean);
const ym = (v: unknown) => {
  const t = s(v);
  if (t && !/^\d{4}(-\d{2})?$/.test(t)) throw new HttpError(400, `Dates must be YYYY-MM (got "${t}")`);
  return t;
};

export const PROFILE_TEXT_FIELDS = [
  ...new Set([
    ...PROFILE_GROUP_TEXT_KEYS,
    "label", "fullName", "location", "summary", "openaiModel", "salaryCurrency", "salaryPeriod", "resumeReferenceName",
  ]),
];

const LONG_TEXT_LIMITS = { about: 20000, resumeReference: 30000 } as const;

/** Validates and normalises an admin profile payload. Only keys present in the body are returned. */
export function profileUpdate(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_TEXT_FIELDS) if (k in body) out[k] = s(body[k]);
  for (const [k, max] of Object.entries(LONG_TEXT_LIMITS)) {
    if (!(k in body)) continue;
    const v = s(body[k]);
    if (v.length > max) throw new HttpError(400, `${k === "about" ? "About this developer" : "The imported resume"} is too long (max ${max.toLocaleString()} characters)`);
    out[k] = v;
  }
  if ("workSetup" in body) out.workSetup = list(body.workSetup).filter((x) => (WORK_SETUPS as readonly string[]).includes(x));
  if ("salaryCurrency" in out && !(SALARY_CURRENCIES as readonly string[]).includes(out.salaryCurrency as string)) out.salaryCurrency = "USD";
  if ("salaryPeriod" in out && !(SALARY_PERIODS as readonly string[]).includes(out.salaryPeriod as string)) out.salaryPeriod = "year";
  for (const k of URL_FIELDS) if (k in out) out[k] = normalizeUrl(out[k] as string);
  // Keep the document name in sync with first/last name when those are given.
  if (!s(body.fullName) && (s(body.firstName) || s(body.lastName)))
    out.fullName = [s(body.firstName), s(body.lastName)].filter(Boolean).join(" ");
  if (!s(body.location) && (s(body.city) || s(body.state)))
    out.location = [s(body.city), s(body.state)].filter(Boolean).join(", ");
  if ("skills" in body) out.skills = list(body.skills);
  if ("certifications" in body) out.certifications = list(body.certifications);
  if ("active" in body) out.active = !!body.active;
  if ("companyCooldownDays" in body) {
    const raw = body.companyCooldownDays;
    if (raw === null || raw === "" || raw === undefined) out.companyCooldownDays = null;
    else {
      const d = Number(raw);
      if (!Number.isInteger(d) || d < 0 || d > 365) throw new HttpError(400, "Company cooldown must be a whole number of days (0–365)");
      out.companyCooldownDays = d;
    }
  }
  if ("monthlyQuota" in body) {
    const q = Number(body.monthlyQuota);
    if (!Number.isInteger(q) || q < 0) throw new HttpError(400, "Monthly quota must be a whole number ≥ 0");
    out.monthlyQuota = q;
  }
  if ("experience" in body) {
    out.experience = (Array.isArray(body.experience) ? body.experience : []).map((e: Record<string, unknown>) => {
      if (!s(e.company)) throw new HttpError(400, "Each experience needs a company");
      return {
        company: s(e.company),
        title: s(e.title),
        location: s(e.location),
        startDate: ym(e.startDate),
        endDate: e.current ? "" : ym(e.endDate),
        current: !!e.current,
        description: s(e.description),
      };
    });
  }
  if ("education" in body) {
    out.education = (Array.isArray(body.education) ? body.education : []).map((e: Record<string, unknown>) => {
      if (!s(e.university)) throw new HttpError(400, "Each education entry needs a university");
      return {
        university: s(e.university),
        degree: s(e.degree),
        field: s(e.field),
        startDate: ym(e.startDate),
        endDate: ym(e.endDate),
      };
    });
  }
  for (const k of ["resumeDesign", "coverLetterDesign"] as const) {
    if (!(k in body)) continue;
    if (!isDesignId(body[k])) throw new HttpError(400, `Unknown design "${s(body[k])}"`);
    out[k] = body[k];
  }
  if ("apiKey" in body) {
    const id = s(body.apiKey);
    if (id && !Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid API key");
    out.apiKey = id || null;
  }
  // The internal label defaults to the name on the resume.
  if ("label" in out && !out.label && out.fullName) out.label = out.fullName;
  if ("label" in out && !out.label) throw new HttpError(400, "Label is required");
  if ("fullName" in out && !out.fullName) throw new HttpError(400, "Full name is required");
  return out;
}

/**
 * "Belongs to user": makes `managerId` (a "user"-role account) the only manager of the profile; "" = no manager
 * (admins only). Bidder assignments are separate and untouched.
 */
export async function setProfileManager(profileId: Types.ObjectId, managerId: unknown) {
  const id = s(managerId);
  if (id && !Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid user");
  const { User } = await import("./models/User");
  if (id && !(await User.exists({ _id: id, role: "user" }))) throw new HttpError(400, "That account is not a user who can manage profiles");
  await User.updateMany({ managedProfiles: profileId, ...(id ? { _id: { $ne: id } } : {}) }, { $pull: { managedProfiles: profileId } });
  if (id) await User.updateOne({ _id: id }, { $addToSet: { managedProfiles: profileId } });
}
