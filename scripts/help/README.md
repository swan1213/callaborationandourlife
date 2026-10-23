# Help screenshots

The in-app Help guide (`src/lib/helpContent.ts`) shows one screenshot per step: `public/help/<page id>-<step number>.webp`.
These scripts recreate them from fictional demo data, so no real person's data ever appears in the guide.

Never point them at the production database: `seed-demo.ts` refuses to run unless `MONGODB_URI` is a local server and `MONGODB_DB` contains `demo`.

## Refresh

Needs a local MongoDB on `127.0.0.1:27017` and Playwright's Chromium (`npx playwright install chromium`).
Run from the repository root in Git Bash:

```sh
export MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB=tailorbid_help_demo ENCRYPTION_KEY=help-demo-encryption-key

# 1. Demo data: people, profiles, applications, interviews… (all passwords: Demo-pass-2026!)
npx tsx scripts/help/seed-demo.ts

# 2. The app on port 3100 against the demo database, with email, OpenAI and push switched off
mkdir -p public/help-demo && cp scripts/help/assets/*.png public/help-demo/
EMAIL_ENABLED=0 RESEND_API_KEY= OPENAI_API_KEY= VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= CRON_SECRET= \
  SEED_ADMIN_EMAIL= SEED_ADMIN_PASSWORD= APP_URL=http://localhost:3100 npx next dev --webpack -p 3100

# 3. In another terminal (same exports): capture, then convert to WebP
HELP_RAW=/tmp/help-raw npx tsx scripts/help/capture.ts            # or only some: ... capture.ts admin-users my-page-2
python scripts/help/to-webp.py /tmp/help-raw public/help

# 4. Clean up
rm -rf public/help-demo
```

Re-seed before a full run: capturing opens applications and feedback, which marks them read.

## Adding or changing a step

Steps are numbered by position, so inserting a step shifts the images after it. Add the shot to `SHOTS` in
`capture.ts` (role, page, optional `prepare` actions, and the `target` to outline in red), then re-run the capture
for that page. `GETTING_STARTED` points at specific page images by name; check those still show the right thing.
