// Company / role of an application: when they are missing ("Unknown company" / "Untitled role"),
// the bidder may fill them in, and the application can't be submitted until both are set.

const UNKNOWN_COMPANY = /^(unknown( company)?|n\/?a|none|-+|\?+)$/i;
const UNTITLED_ROLE = /^(untitled( role)?|unknown( role)?|n\/?a|none|-+|\?+)$/i;

export const isUnknownCompany = (v?: string | null) => !v || !v.trim() || UNKNOWN_COMPANY.test(v.trim());
export const isUntitledRole = (v?: string | null) => !v || !v.trim() || UNTITLED_ROLE.test(v.trim());

/** Why the application can't be submitted yet (missing company / role), or "" when both are set. */
export function missingJobInfo(a: { company?: string | null; jobTitle?: string | null }) {
  const company = isUnknownCompany(a.company);
  const role = isUntitledRole(a.jobTitle);
  if (company && role) return "The company is unknown and the role is untitled. Add the company name and the role before submitting.";
  if (company) return "The company is unknown. Add the company name before submitting.";
  if (role) return "The role is untitled. Add the role before submitting.";
  return "";
}
