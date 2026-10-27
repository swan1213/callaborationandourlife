// Client-safe.

/**
 * Job text as shown: escaped line breaks some postings carry as text ("\n" typed into the employer's HTML) become real
 * ones, and runs of blank lines collapse.
 */
export function tidyJobText(text: string) {
  return (text || "")
    .replace(/\r\n|\n|\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
