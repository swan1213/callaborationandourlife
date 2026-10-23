// Client-safe definitions of the application-form fields stored on every profile.
// Drives the profile editor and the read-only profile view.

export type Option = { value: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  /** "select": `options`, "" shows `emptyLabel`; "checks": multi-select stored as a string array; "salary": amount + currency + period. */
  type?: "text" | "email" | "url" | "date" | "tel" | "select" | "checks" | "salary";
  options?: Option[];
  emptyLabel?: string;
  placeholder?: string;
  /** Columns spanned in the group's grid. */
  span?: number;
  required?: boolean;
  /** Only shown when another field has this value. */
  showIf?: { key: string; value: string };
};

export type FieldGroup = { id: string; title: string; hint?: string; cols: 2 | 3; fields: FieldDef[] };

const opts = (...values: string[]): Option[] => values.map((v) => ({ value: v, label: v }));
const YES_NO = opts("Yes", "No");
const DECLINE = "Decline to answer";

export const WORK_SETUPS = ["Remote", "Hybrid", "On-site"] as const;
export const SALARY_CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "INR"] as const;
export const SALARY_PERIODS = ["year", "month", "hour"] as const;

/**
 * Starting values for a new profile's application-form fields (the usual answers; edit per profile).
 * Existing profiles keep what they have: blank fields are not filled in.
 */
export const PROFILE_DEFAULTS: Record<string, string> = {
  pronouns: "He/Him",
  workAuthorizedUS: "Yes",
  needsSponsorship: "No",
  visaStatus: "US Citizen",
  sponsorshipFreeRegions: "United States",
  securityClearance: "None",
  gender: "Male",
  ethnicity: "Not Hispanic or Latino",
  race: "", // Decline to answer
  veteranStatus: "I am not a protected veteran",
  disabilityStatus: "No, I do not have a disability",
};

export const PROFILE_GROUPS: FieldGroup[] = [
  {
    id: "personal",
    title: "Personal",
    cols: 3,
    fields: [
      { key: "firstName", label: "First name", required: true },
      { key: "middleName", label: "Middle name" },
      { key: "lastName", label: "Last name", required: true },
      { key: "preferredName", label: "Preferred name", placeholder: "e.g. Sam" },
      { key: "pronouns", label: "Pronouns", type: "select", options: opts("He/Him", "She/Her", "They/Them"), emptyLabel: "Not set" },
      { key: "professionalTitle", label: "Professional title", placeholder: "Senior Full Stack Engineer" },
      { key: "dateOfBirth", label: "Date of birth", type: "date" },
    ],
  },
  {
    id: "contact",
    title: "Contact & links",
    hint: "email, phone and LinkedIn are shown at the top of every resume",
    cols: 2,
    fields: [
      { key: "email", label: "Email", type: "email", placeholder: "name@example.com" },
      { key: "phone", label: "Phone", type: "tel", placeholder: "+1 555 010 0000" },
      { key: "linkedin", label: "LinkedIn", type: "url", placeholder: "linkedin.com/in/…" },
      { key: "github", label: "GitHub", type: "url", placeholder: "github.com/…" },
      { key: "portfolio", label: "Portfolio", type: "url" },
      { key: "website", label: "Website", type: "url" },
      { key: "otherLink", label: "Other link", placeholder: "Stack Overflow, Dribbble, blog…", span: 2 },
    ],
  },
  {
    id: "address",
    title: "Address",
    hint: "resumes show only the city and state",
    cols: 2,
    fields: [
      { key: "street", label: "Street address", span: 2 },
      { key: "street2", label: "Apartment, suite, etc.", span: 2 },
      { key: "city", label: "City" },
      { key: "state", label: "State / region" },
      { key: "zipcode", label: "ZIP / postal code" },
      { key: "country", label: "Country", placeholder: "United States" },
      { key: "timezone", label: "Time zone", placeholder: "e.g. US Central (UTC−6)" },
    ],
  },
  {
    id: "work",
    title: "Work & eligibility",
    hint: "eligibility, salary and clearance are never written into resumes",
    cols: 2,
    fields: [
      { key: "yearsExperience", label: "Years of experience", placeholder: "8" },
      { key: "englishLevel", label: "English level", placeholder: "Native / Fluent / C1" },
      { key: "currentCompany", label: "Current company", span: 2 },
      { key: "workAuthorizedUS", label: "Authorized to work in the US?", type: "select", options: YES_NO, emptyLabel: "Not set" },
      { key: "needsSponsorship", label: "Needs visa sponsorship?", type: "select", options: YES_NO, emptyLabel: "Not set" },
      { key: "visaStatus", label: "Work authorization / visa status", placeholder: "US citizen, Green card, H-1B, TN…" },
      { key: "sponsorshipFreeRegions", label: "Can work without sponsorship in", placeholder: "United States, Canada, EU" },
      { key: "workSetup", label: "Work setup", type: "checks", options: opts(...WORK_SETUPS), span: 2 },
      { key: "willingToRelocate", label: "Willing to relocate?", type: "select", options: opts("Yes", "No", "Open to discuss"), emptyLabel: "Not set" },
      {
        key: "availability",
        label: "Notice period / earliest start",
        type: "select",
        options: opts("Immediately", "1 week", "2 weeks", "3 weeks", "1 month", "2 months", "3+ months"),
        emptyLabel: "Not set",
      },
      { key: "salary", label: "Expected salary", type: "salary", placeholder: "150,000", span: 2 },
      { key: "securityClearance", label: "Security clearance", placeholder: "None, Secret, Top Secret…", span: 2 },
    ],
  },
  {
    id: "selfid",
    title: "Voluntary self-identification",
    hint: "optional; never sent to the AI or written into documents",
    cols: 2,
    fields: [
      { key: "gender", label: "Gender", type: "select", options: opts("Male", "Female", "Non-binary"), emptyLabel: DECLINE },
      {
        key: "ethnicity",
        label: "Hispanic or Latino?",
        type: "select",
        options: [
          { value: "Hispanic or Latino", label: "Yes" },
          { value: "Not Hispanic or Latino", label: "No" },
        ],
        emptyLabel: DECLINE,
      },
      {
        key: "race",
        label: "Race",
        type: "select",
        options: opts(
          "Asian",
          "White",
          "Black or African American",
          "Hispanic or Latino",
          "American Indian or Alaska Native",
          "Native Hawaiian or Other Pacific Islander",
          "Two or more races"
        ),
        emptyLabel: DECLINE,
      },
      {
        key: "veteranStatus",
        label: "Veteran status",
        type: "select",
        options: opts("I am not a protected veteran", "I identify as one or more of the classifications of protected veteran"),
        emptyLabel: DECLINE,
      },
      {
        key: "asianSubgroup",
        label: "If Asian",
        type: "select",
        options: opts("East Asian", "South Asian", "Southeast Asian"),
        emptyLabel: DECLINE,
        showIf: { key: "race", value: "Asian" },
      },
      {
        key: "disabilityStatus",
        label: "Disability status",
        type: "select",
        options: opts("No, I do not have a disability", "Yes, I have a disability"),
        emptyLabel: DECLINE,
        span: 2,
      },
    ],
  },
];

/** Keys of the plain string fields above (not "checks"). */
export const PROFILE_GROUP_TEXT_KEYS = PROFILE_GROUPS.flatMap((g) => g.fields.filter((f) => f.type !== "checks").map((f) => f.key));

/** Options for a select, keeping a stored value that is no longer in the list (e.g. older wording) selectable. */
export function selectOptions(f: FieldDef, current: string): Option[] {
  const list = f.options ?? [];
  return current && !list.some((o) => o.value === current) ? [...list, { value: current, label: current }] : list;
}

/** "150,000 USD per year" for the read-only view. */
export function salaryText(p: Record<string, unknown>) {
  const amount = String(p.salary ?? "").trim();
  if (!amount) return "";
  return [amount, p.salaryCurrency || "", p.salaryPeriod ? `per ${p.salaryPeriod}` : ""].filter(Boolean).join(" ");
}
