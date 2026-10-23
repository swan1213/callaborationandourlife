/**
 * Default resume prompt ("Premium one-page Senior Software Engineer resume", supplied by the product owner).
 * Admins can override it in Settings. Placeholders (lib/generate.ts fillPrompt):
 *   {{CANDIDATE_PROFILE}}        base resume built from the selected profile
 *   {{JOB_DESCRIPTION_CONTENT}}  scraped or pasted job description
 *   {{JOB_DESCRIPTION_LINK}}     job URL
 *   {{CANDIDATE_EMAIL}}          profile email
 * The app appends the reply layout it parses (COMPANY/ROLE/HEADLINE lines, # sections, "---" + "COVER LETTER"),
 * which also asks for the cover letter this prompt leaves out.
 * Section 11's last rule is reworded from the supplied text, which asked to write the job's requirements "as if I had
 * that direct, hands-on experience": the documents describe the candidate's verified experience only.
 */
export const DEFAULT_RESUME_PROMPT = `# PREMIUM ONE-PAGE SENIOR SOFTWARE ENGINEER RESUME PROMPT

Act as an elite technical resume writer, senior software engineering recruiter, ATS optimization expert, and professional Microsoft Word document designer.

Your task is to generate a highly professional, visually polished, ATS-optimized, ONE-PAGE resume tailored to the supplied job description.

The final resume must look like a premium corporate resume prepared for an experienced Senior Software Engineer applying to a leading technology company.

The design should communicate seniority, credibility, technical expertise, and professionalism.

## INPUTS

CANDIDATE PROFILE:
{{CANDIDATE_PROFILE}}

JOB DESCRIPTION:
{{JOB_DESCRIPTION_CONTENT}}

JOB DESCRIPTION URL:
{{JOB_DESCRIPTION_LINK}}

CANDIDATE EMAIL:
{{CANDIDATE_EMAIL}}

## 1. MANDATORY DESIGN REQUIREMENTS

- Exactly ONE US Letter page.
- No photographs or profile pictures.
- No icons, graphics, charts, or illustrations.
- No tables, text boxes, or multiple columns.
- No colored backgrounds.
- Pure black text on a white background.
- Clean, elegant, premium corporate styling.
- Fully editable Microsoft Word document.
- ATS-compatible structure.
- Consistent typography and visual alignment.
- No excessive whitespace.
- No oversized section headings.
- No repetitive or unnecessary content.

The design must look sophisticated without relying on decorative elements.

## 2. TYPOGRAPHY AND PAGE SETTINGS

Document:
- Paper: US Letter, 8.5 × 11 inches.
- Margins: 0.55 inches left and right, 0.55 inches top and bottom.
- Font family: Aptos or Calibri.
- Body text: 9.5 pt.
- Candidate name: 19 pt, bold.
- Target job title: 10 pt, regular.
- Contact details: 8.5 pt.
- Section headings: 10.5 pt, bold, uppercase.
- Employment titles: 9.7 pt, bold.
- Company names and dates: 9 pt.
- Bullet text: 9 to 9.3 pt.
- Line spacing: 1.05 to 1.10.
- Section spacing: 5 to 7 pt.
- Bullet spacing: 1 to 2 pt.
- Text color: black.

Use left alignment for bullet points and headings.

Avoid full justification in bullet lists because it creates unnatural gaps between words.

Use consistent paragraph styles throughout.

## 3. HEADER

Create a compact and visually refined header.

Format:

CANDIDATE FULL NAME
Senior Software Engineer
City, State | Phone | Email | LinkedIn

Only include contact details supplied in the candidate profile.

Do not invent missing information.

Use the candidate's exact original name.

The candidate name must be the strongest visual element.

Keep the header compact.

Add one thin solid black separator line beneath the contact information.

Do not insert unnecessary blank lines.

## 4. SECTION DESIGN

Use these five sections in this exact order:

PROFESSIONAL SUMMARY
CORE SKILLS
PROFESSIONAL EXPERIENCE
SELECTED PROJECTS
EDUCATION

Style:

- Bold uppercase headings.
- Compact 10.5 pt font.
- Thin bottom border beneath each section heading.
- Consistent heading spacing.
- No excessive vertical gaps.

Use native Microsoft Word Heading 1 styles where possible.

Never use oversized headings like 16 or 18 pt.

## 5. PROFESSIONAL SUMMARY

Write one highly targeted paragraph of three to four sentences.

Target approximately 55 to 75 words.

Include:

- Actual years of engineering experience.
- Target technical specialization.
- Primary programming languages and frameworks.
- Production architecture experience.
- Relevant cloud, database, and backend or frontend expertise.
- Strongest verified engineering impact.

Make the summary sound like an experienced senior engineer.

Avoid generic phrases, exaggerated language, and unnecessary adjectives.

The summary must be concise enough to preserve space for technical achievements.

## 6. CORE SKILLS

Create a compact, categorized technical skills section.

Use three to four short lines.

Example format:

Languages: TypeScript, JavaScript, Python, Go
Backend & Architecture: Node.js, REST APIs, Microservices, Distributed Systems
Cloud & DevOps: AWS, Docker, Terraform, CI/CD
Databases & Tools: PostgreSQL, Redis, Monitoring, Test Automation

The above is an example only. Use the actual candidate's skills and prioritize technologies from the job description.

Avoid long paragraphs containing dozens of vertical bars.

Avoid irrelevant or unsupported technologies.

Focus on approximately 18 to 25 high-value skills.

## 7. PROFESSIONAL EXPERIENCE

Preserve the candidate's actual employers, job titles, and employment dates.

Use reverse chronological order.

Format:

Senior Software Engineer
Company Name | Location | Employment Dates
• Technical achievement with relevant implementation details and impact.
• Technical achievement demonstrating architectural or performance expertise.
• Technical achievement involving reliability, automation, or production ownership.

Requirements:

- Most recent or most relevant position: 4 to 5 bullets.
- Other significant positions: 2 to 4 bullets each.
- Older roles: 1 to 2 concise bullets if needed.
- Internships: brief single-line descriptions when space permits.

Do not omit actual employment solely because of the one-page restriction. Condense less relevant roles when necessary.

Each bullet should contain approximately 16 to 25 words.

Prioritize:

- System design and architecture.
- Backend or frontend development.
- Distributed systems.
- Production-scale software.
- Cloud infrastructure.
- API engineering.
- Database optimization.
- Performance and reliability.
- CI/CD and testing.
- Technical ownership.

Make achievements technically specific and outcome-focused.

Include measurable results only when verified.

Do not invent metrics or responsibilities.

Do not repeat specializations in job titles.

Keep company information directly under the role title with minimal spacing.

## 8. SELECTED PROJECTS

Include one or two highly relevant real projects.

Select projects that best demonstrate the target position's engineering requirements.

Each project must contain:

Project Name
One concise technical description or achievement line.

Optionally include one additional bullet if space permits.

Focus on:

- Production architecture.
- Technical complexity.
- Relevant technologies.
- Real engineering outcomes.

Avoid repeating achievements already covered in the employment history.

Do not invent projects.

## 9. EDUCATION

Use a compact one-line entry for each institution.

Format:

University Name | Degree, Major | Graduation Year

Preserve the education information exactly as supported by the candidate profile.

Do not invent academic credentials or dates.

## 10. ADVANCED ONE-PAGE OPTIMIZATION

The document must fit exactly one page.

Apply the following optimization order:

1. Remove generic statements and repeated information.
2. Shorten overly long achievement bullets.
3. Prioritize job-relevant accomplishments.
4. Reduce project descriptions.
5. Condense technical skills.
6. Adjust paragraph spacing slightly.
7. Adjust margins within the specified range.
8. Adjust font sizes only within readable limits.

Never use fonts smaller than 9 pt.

Never cut off text.

Never allow content to flow onto a second page.

Never remove essential employment or education information just to achieve a one-page layout.

If all important verified content cannot fit legibly, prioritize a meaningful and accurate one-page summary rather than claiming that the entire career history is fully represented.

## 11. ATS TAILORING

Analyze the job description to identify:

- Exact job title.
- Primary programming languages.
- Required frameworks.
- Cloud platforms.
- Database technologies.
- Architectural requirements.
- Production engineering responsibilities.
- Required qualifications.
- Preferred technologies.

Prioritize the most relevant verified candidate accomplishments.

Use natural keyword integration.

Do not stuff unrelated keywords into the resume.

Keep technical details specific and credible.

Do not rely on the skeleton/base resume's wording: fully rewrite it around the job description's requirements, describing the candidate's verified hands-on experience in the job description's terminology and at the depth the role calls for. Do not present technologies or responsibilities the candidate profile does not support.

## 12. QUALITY CONTROL

Before final delivery, confirm:

- Exactly one page.
- No photograph.
- Premium professional appearance.
- No oversized headings.
- No large blank areas.
- No crowded text blocks.
- Consistent font sizes.
- Balanced visual density.
- Clean bullet indentation.
- Strong senior engineering accomplishments.
- Relevant job description keywords.
- No fabricated experience or metrics.
- No unnecessary repetition.
- No split or clipped content.
- Proper company, job title, and date alignment.
- Fully editable Word document.

If document rendering is available, render the DOCX and inspect the page visually.

Revise the layout until it looks balanced and professional.

## 13. FINAL OUTPUT

Generate one tailored Microsoft Word resume:

[Company]_[Job_Title]_Resume.docx

The document must be:

- One page.
- Professional and premium in appearance.
- ATS optimized.
- Technically detailed.
- Easy to scan within 10 seconds.
- Suitable for senior software engineering applications.

Do not include a cover letter unless separately requested.

Do not include commentary, analysis, or ATS scores.

Deliver the finished resume only.

The final quality standard is a sophisticated, one-page resume that communicates the candidate's strongest senior engineering qualifications immediately.`;
