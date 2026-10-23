# Interview Assistant (React)

A helper for non-native English speakers during online interviews, running in your browser on Windows. It reads Windows Live Captions of the meeting, shows them in the app, spots the interviewer's questions, and streams a suggested answer. The answer is written in simple, easy-to-say English and based on your resume and the job description.

## Part of TailorBid

This app lives in TailorBid's repository (`assistant/`) and runs on the user's Windows PC (it reads Windows Live Captions, so it can't run on Vercel). From the TailorBid folder:

```bash
npm run assistant:install   # first time
npm run assistant           # build and start it at http://127.0.0.1:4317
```

In TailorBid, **Interview Assistant** (on an interview, or on the schedule page) opens it connected to TailorBid for 12 hours:

- The interview's tailored resume (or the profile's base resume) and job description are loaded into Setup. **Reload resume & job** in Setup → Connection loads them again.
- OpenAI calls go through TailorBid (`/api/assistant/openai`) with TailorBid's key for that profile (profile key → default key → `OPENAI_API_KEY`), so the key never reaches this PC and no key is needed here.
- Interviews you record are saved to **Interview History** in TailorBid (under Manage; callers see it in their menu), with the transcript, suggested answers, an AI review and Markdown export. Admins see everyone's, users and callers their own; bidders don't have it. Without a TailorBid connection, interviews are not saved.
- Only TailorBid's own site (`APP_URL`) can connect it, plus `http://localhost:3000` for development.

Not connected (or after **Disconnect**), the assistant uses a key saved in Setup or TailorBid's `OPENAI_API_KEY`.

| TailorBid file | Purpose |
|---|---|
| `src/components/InterviewAssistant.tsx` | The dialog behind the button; opens the assistant with `#tailorbid={ origin, token }` |
| `src/lib/assistant.ts` | Assistant tokens (12 h, own signing key), access checks, resume as text |
| `src/app/api/assistant/session` · `context` · `openai/[...path]` | Token for an interview · resume and job description · OpenAI pass-through |
| `assistant/server/tailorbid.cjs` | The assistant's side: allowed sites, connect, reload, OpenAI client options |

## Windows app (for people who aren't developers)

TailorBid's **Interview Assistant** dialog has a **Download for Windows** button. It downloads `Interview-Assistant-Setup.exe` from this repository's latest GitHub release. The installer needs no admin rights. The app:

- runs the assistant in the background with a tray icon (Open, Start with Windows, Check for updates, Quit);
- starts with Windows, so the button in TailorBid always works;
- updates itself from GitHub Releases.

The UI still opens in the browser. The app is built with Electron (`desktop/main.cjs`, `electron-builder.yml`). `desktop/prepare.mjs` builds into it only `APP_URL` and the assistant address from TailorBid's `.env.local`. No keys or secrets go into the installer.

Publish a new version:

```bash
# 1. raise "version" in assistant/package.json (e.g. 0.1.1): installed copies update to it
npm run dist:win             # build release/Interview-Assistant-Setup.exe, latest.yml and the .blockmap
gh release create v0.1.1 release/Interview-Assistant-Setup.exe release/Interview-Assistant-Setup.exe.blockmap release/latest.yml   --title "Interview Assistant 0.1.1" --notes "What changed"
```

The download link always points to the latest release, so TailorBid needs no change. The installer isn't code-signed, so Windows shows "Windows protected your PC" the first time (More info → Run anyway). A code-signing certificate removes that warning.

## Stack

- **React app (Vite)**, in `src/`: the whole UI, opened in Chrome or Edge.
- **Local Node server**, in `server/`: OpenAI calls, settings, reading Windows Live Captions, project files. It listens only on `127.0.0.1` and also serves the built app.

The OpenAI API key stays in the server and never reaches the browser. The server only accepts requests from the app itself (local host name plus a custom header), so other websites can't use it.

## Run

Needs Node.js 20.19 or newer (22.12+ on Node 22).

```bash
npm install
npm start        # build the React app, start the server and open http://127.0.0.1:4317
npm run serve    # start the server again without rebuilding
npm run dev      # Vite dev server (hot reload, http://127.0.0.1:5173) + the API server, restarted on changes
npm test         # unit tests for caption, question and answer logic
```

There is one env file for TailorBid and the assistant: TailorBid's `.env.local` (repository root). The assistant reads only its own values from it, never TailorBid's database or other secrets:

```
NEXT_PUBLIC_ASSISTANT_URL=http://127.0.0.1:4317   # where TailorBid opens the assistant; its port is the server port
APP_URL=https://your-tailorbid-site               # TailorBid's site: the one allowed to connect the assistant
OPENAI_API_KEY=sk-...                             # TailorBid's key; the assistant uses it directly without TailorBid
ASSISTANT_MODEL=gpt-5.6-terra
ASSISTANT_REASONING_EFFORT=low
ASSISTANT_TRANSLATE_MODEL=gpt-6-luna
ASSISTANT_SERVICE_TIER=priority                   # fast mode: answers start in ~1s, about 2x price; "default" for standard
```

All of them are optional. Everything in it can also be set in the app under **Setup → Connection**: the API key, answer model, speed tier, reasoning effort and translation model. Each setting shows where its value comes from (**Set in app**, **From .env.local** or **Default**); a value set in the app wins over `.env.local`, and **Reset** goes back to the `.env.local`/default value. **Test** checks the key and all models together with one tiny request; **Save connection** applies changes immediately, no restart needed. A key entered in the app is stored encrypted with Windows DPAPI.

Settings and prep sheets are saved in `%APPDATA%\Interview Assistant` (set `IA_DATA_DIR` to use another folder). This is the same folder the old desktop version used, so your profile carries over. An API key saved by the desktop version can't be read, so enter it again in Setup (or keep it in `.env.local`).

Then open **Setup**:
- **Resume:** click **Import file…** to load a PDF, Word (.docx) or text file, or paste the text. The imported text stays editable.
- **Job description:** import a file the same way, or type/paste it.
- **Your language:** used to translate captions and answers, and to explain each question.

## Usage

1. Turn on **Windows Live Captions** (`Win+Ctrl+L`, Windows 11) and click **Start interview**. The server reads Live Captions' text directly, with no copy and paste. It's free, runs on your PC, and a question is sent about 0.5 s after the interviewer finishes it. Live Captions is opened for you if it isn't running.
2. Words being spoken appear in grey right away. A sentence becomes a caption line as soon as Live Captions finishes it, without waiting for a pause; when Live Captions rewrites its last words, the line is updated instead of duplicated. Questions are highlighted, and with **Auto** on, an answer streams in automatically.
3. Answers are fast because:
   - **Common questions** ("Tell me about yourself", weaknesses, salary…) are answered **instantly** from answers prepared when you press Start.
   - Other questions get an **instant opener** to say ("Yeah, good question. So…") while the answer loads, and an **early draft** starts while the interviewer is still talking.
4. Answers come in short numbered paragraphs, one sentence per line, in a casual tone by default (Setup → Tone). Emotion and gesture cues (🙂 smile, 👐 open hands, ⏸️ pause…) can be turned off in Setup. The interviewer's mood is shown below the answer, and the header shows how fast the first words arrived.
5. Hotkeys work even while the meeting window is focused (the server registers them with Windows while the app is open in a tab):
   - `Ctrl+Shift+Space`: answer the latest captions
   - `Ctrl+Shift+H`: hide/show the browser window showing the app (and the on-top window)
   - `Ctrl+Shift+M`: switch between Full / Medium / Mini
   - `Ctrl+Enter` (inside the app): answer the latest captions

   If another program already uses one of these keys, the app says so and that key only works while the app has focus.
6. **Translate → <language>** shows a translation under each English caption. Under an answer, **Translate answer** shows what you are about to say in your language.
7. **On top** (Chrome / Edge) moves the assistant into a small Picture-in-Picture window that stays above the meeting. Close that window, or switch **On top** off, to bring it back into the tab.
8. **Full / Medium / Mini** (header, or `Ctrl+Shift+M`) changes the layout (and the on-top window's size):
   - **Full:** answer, captions and all controls.
   - **Medium:** the answer plus the last three caption lines.
   - **Mini:** only the answer in large text, with the words being spoken under it. The other controls are in the **⋯** menu.

## Prepare: take-home project review

Open the **Prepare** tab and choose your project folder (a Windows folder picker opens). The app lists the files it will send and asks before sending. It skips `node_modules`, build output, lock files, `.env` and key files. You get a prep sheet with an overview, the tech stack, how the parts fit together, the decisions you'll be asked about (with easy ways to say them), likely questions with answers, weak spots and how to address them, "with more time I would…" points, and words to practice with pronunciation. Prep sheets are saved on this PC; **Delete all my data** in Setup removes them.

**Use in interview:** on a prep sheet, click **Use in interview**. Live answers then get a short brief of the project (overview, stack, key decisions, weak spots, file guide), so answers about it name real files and choices. A **Your code** panel under the answer shows the relevant code with file names and line numbers: first from an instant local keyword search, then from the files the answer names. Code is read only from that project folder on your PC (same filters: no `.env` or key files, nothing outside the folder) and is not sent to OpenAI.

## Architecture

```
Windows Live Captions ──(UI Automation, server/live-captions.ps1, on this PC)──▶ caption text
   │ POST /api/captions/stream (one JSON line per change)
   │ src/useLiveCaptions.js + src/captionDiff.js: new words → grey live text → caption lines
   ▼
question detection (src/questions.js) ──▶ prepared answer (instant) or opener + streamed answer
   │ POST /api/ai/answer (streamed back line by line; closing the request cancels it)
   ▼
server: OpenAI Responses API (server/ai.cjs, prompt in server/prompts.cjs)
      ──▶ ANSWER / KEY POINTS / FILES / MOOD / MEANING
```

Captions never use OpenAI: they come only from Windows Live Captions on your PC. The app doesn't record audio.

| File | Purpose |
|---|---|
| `server/index.cjs` | Local HTTP server: `/api/*` routes, request checks, serves `dist/`, one copy only |
| `server/ai.cjs` | OpenAI calls: answers, translation, reports; friendly error messages |
| `server/prompts.cjs` | The answer prompt (edit this to tune answers) |
| `server/prepared.cjs`, `src/commonQuestions.js` | Instant answers to common questions, cached on disk |
| `server/settings.cjs`, `server/secret.cjs`, `server/paths.cjs` | Settings in `%APPDATA%/Interview Assistant/settings.json`, key encrypted with DPAPI |
| `server/importers.cjs` | Text extraction from uploaded PDF / DOCX / TXT |
| `server/live-captions.ps1`, `server/liveCaptions.cjs` | Read Windows Live Captions text via UI Automation |
| `server/desktop.cjs` | Folder picker, "Show file" in Explorer, opening the browser |
| `server/hotkeys.ps1`, `server/hotkeys.cjs` | Global hotkeys (Windows `RegisterHotKey`), hide/show of the app window |
| `server/projectAnalyzer.cjs`, `src/Prepare.jsx` | Take-home project scan, prep sheet, "Use in interview" code lookup |
| `server/sessions.cjs`, `src/sessionRecorder.js`, `src/StartSessionDialog.jsx` | Records the interview and saves it to **Interview History** in TailorBid while it runs |
| `src/api.js` | Calls to the local server (JSON and streamed replies) |
| `src/onTop.js` | **On top**: Document Picture-in-Picture window |
| `src/App.jsx` | Live view: answer, code panel, captions |
| `src/Setup.jsx`, `src/ConfirmDialog.jsx` | Setup page and confirmations |
| `src/AnswerText.jsx` | Renders answers as numbered paragraphs with cue icons |
| `src/useLiveCaptions.js`, `src/captionDiff.js` | Turn the rolling Live Captions text into caption lines |
| `src/questions.js` | Question detection, draft matching |
| `src/answerFormat.js` | Reads the answer sections (ANSWER, KEY POINTS…) and rewrites written-English phrases into plain speech; shared by the app and the server |
| `test/` | Unit tests (`npm test`): captions, questions, answer streams, settings, sessions, project file access |
