/** Normalised company key: "Acme, Inc." / "ACME Inc" / "acme" → "acme". */
export function companyKey(name: string) {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|inc|incorporated|llc|l l c|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|srl|bv|pty|pvt|private|holdings?|group)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
