# TailorBid

Tailored resumes, cover letters and job descriptions for full-time applications.
Next.js 16 (App Router) · MongoDB Atlas · OpenAI · Cloudinary · Resend · deploys to Vercel.

## Roles

| Role | What they do |
| --- | --- |
| **Admin** | Everything. |
| **User** | Manages the profiles an admin assigns to them: edits profile content, sees history and exports, assigns their profiles to bidders, and gets the daily report and milestone emails for those profiles. |
| **Bidder** | Generates tailored applications with assigned profiles and tracks submissions. New sign-ups are bidders. |

## How it works

**Bidders**
1. Paste a job posting URL (or the description text) and pick an assigned profile.
2. The posting is scraped, and the role, company and location are filled in automatically.
3. The next page offers a ZIP named `{Date}-{Company}-{Role}.zip` containing:
   resume (PDF + DOCX), cover letter (PDF + DOCX) and job description (DOCX).
4. After applying, drag and drop or paste (Ctrl+V) a screenshot of the confirmation page. The application is then marked as submitted.
5. **My Applications** tracks date, profile, company, role, status and screenshots, with date-range search and totals.
6. **My Profiles** shows read-only application-form details (address, visa, EEO answers and so on) for each assigned profile, with copy buttons.

**Admins**
- **Users & Bidders**: add accounts directly, view, edit, activate/deactivate and delete them. Also approve or reject sign-ups, set the fee per application (e.g. 0.07), assign profiles and reset passwords.
- **Profiles**: add, view, edit, activate/deactivate and delete. Deleting a profile that has history asks for confirmation, and the history keeps the profile's name. Each profile holds all personal, contact, address, work and self-identification fields, plus experience, education, the OpenAI key and model, and a monthly quota. **Import from resume (AI)** fills a profile from a PDF, DOCX or pasted text.
- **API Keys**: OpenAI keys stored encrypted in MongoDB, each with a default model, a monthly token limit and per-token prices. Each profile uses its selected key or the default one, and usage and estimated cost are tracked per key. The `OPENAI_API_KEY` env var is only a bootstrap fallback.
- **Application history**: who generated what, with which profile and when. Filter by user, profile, date and status, and bulk-download a ZIP (all documents or resumes only, plus `summary.csv`).
- **Emails** (styled HTML via Resend):
  - A daily report at midnight: every admin gets all profiles, and each user gets the profiles they manage, with bids per profile plus company, role and time.
  - Milestone emails at the 1st, 50th, 75th and 100th bid, sent to the profile's users and to the bidder. Milestones are configurable, and so is whether they count per day or all-time.
  - Sign-up and approval emails.
- **Settings**: default fee, open or closed registration, the announcement shown on users' My Page, and extra AI instructions.

The tailoring rules (ATS-friendly wording, locked job titles, no long dashes, `|`-separated core skills, `*` bullets, Selected Projects, a humble five-paragraph cover letter) are in `src/lib/generate.ts`. A sanitiser enforces the formatting rules even when the model slips.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run seed                 # creates the admin from SEED_ADMIN_*
node --env-file=.env.local scripts/migrate-roles.mjs   # one-time: old roles user→bidder, manager→user (safe to re-run)
npm run dev
```

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (framework: Next.js, no build settings needed).
2. Copy every variable from `.env.local` into **Project → Settings → Environment Variables**.
   Set `APP_URL` to the production URL.
3. Set `CRON_SECRET`, a long random string. Vercel sends it to `/api/cron/daily-report`.
   `vercel.json` schedules the job at `0 0 * * *` (00:00 UTC). Change the hour so it runs just after midnight in your
   **Settings → Report timezone**, e.g. `0 4 * * *` for New York (EDT) or `0 5 * * *` (EST).
   On the Hobby plan, Vercel may run it any time within that hour. The job always reports the day that just ended, and it sends each day's report only once.
4. In MongoDB Atlas → Network Access, allow `0.0.0.0/0`, because Vercel functions use dynamic IPs.
5. Custom domain: in Vercel go to **Project → Settings → Domains**, add `callaborationandourlife.com` (plus `www` if you want it), and create the DNS records Vercel shows (an `A` record for the apex, a `CNAME` for `www`). Keep `APP_URL=https://callaborationandourlife.com` so links in emails point at the live site. The Resend sender already uses this domain, which is verified in Resend.
6. Deploy. The admin account is also created automatically on first login if none exists.

Generation runs up to 60 s (`maxDuration` in `api/applications/generate`). This works on Hobby and Pro plans.

## Interview Assistant

`assistant/` is the Interview Assistant: live suggested answers during interviews from Windows Live Captions. It runs on the user's Windows PC (not on Vercel; `.vercelignore` leaves it out) and connects to TailorBid from the **Interview Assistant** button: it loads the interview's resume and job description and uses TailorBid's OpenAI key through `/api/assistant/openai`. Interviews it records are saved to **Interview History** (`/interview-history`): admins see all of them, users and callers their own, bidders none. `npm run dev` starts it together with TailorBid (installing its packages the first time); `npm run dev:web` starts TailorBid alone, and `npm run assistant` the assistant alone. Its settings (`NEXT_PUBLIC_ASSISTANT_URL`, `ASSISTANT_*`) are in the same `.env.local`. See [assistant/README.md](assistant/README.md).
