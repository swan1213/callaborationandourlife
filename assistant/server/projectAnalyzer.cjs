const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dataFile, writeJson } = require('./paths.cjs');

// Reads a take-home project folder and asks the model for a prep sheet the candidate can study
// before presenting the project. Only source/text files are read; secrets and build output are skipped.

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  'vendor',
  'target',
  'bin',
  'obj',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  '.vscode',
  '.gradle',
  'Pods',
  '.terraform',
]);
const TEXT_EXT = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.py',
  '.java',
  '.kt',
  '.go',
  '.rb',
  '.php',
  '.cs',
  '.rs',
  '.swift',
  '.scala',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.sql',
  '.graphql',
  '.html',
  '.css',
  '.scss',
  '.md',
  '.txt',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
  '.xml',
  '.sh',
  '.gradle',
  '.prisma',
]);
const TEXT_NAMES = new Set(['Dockerfile', 'Makefile', 'Procfile', 'docker-compose.yml']);
// Never send these, even if they look like text.
const SECRET = /(^\.env)|(\.(pem|key|p12|pfx|keystore|jks)$)|(^id_(rsa|ed25519|ecdsa))|(secret|credential)s?\./i;
const LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'poetry.lock',
  'Cargo.lock',
  'composer.lock',
  'Gemfile.lock',
]);

const MAX_FILE_CHARS = 12000;
const MAX_TOTAL_CHARS = 180000; // roughly 45k tokens
const MAX_FILES = 400;

// Files that explain a project best are read first, so they survive the size budget.
function priority(rel) {
  const base = path.basename(rel).toLowerCase();
  if (base.startsWith('readme')) return 0;
  if (
    ['package.json', 'pyproject.toml', 'requirements.txt', 'pom.xml', 'build.gradle', 'go.mod', 'cargo.toml'].includes(
      base,
    )
  )
    return 1;
  if (/^(main|index|app|server)\./.test(base)) return 2;
  if (/(^|\/)(src|app|lib|api)\//.test(rel)) return 3;
  if (/test|spec/.test(rel)) return 5;
  return 4;
}

function walk(root) {
  const found = [];
  const skipped = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        visit(full);
      } else if (entry.isFile()) {
        if (SECRET.test(entry.name)) skipped.push({ path: rel, reason: 'may contain secrets' });
        else if (LOCKFILES.has(entry.name)) continue;
        else if (TEXT_EXT.has(path.extname(entry.name).toLowerCase()) || TEXT_NAMES.has(entry.name)) found.push(rel);
      }
    }
  };
  visit(root);
  return { found, skipped };
}

// Scans a folder. Returns what will be sent so the user can confirm first.
const pending = new Map(); // token -> scanned project

function scan(folder) {
  const { found, skipped } = walk(folder);
  found.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));

  const files = [];
  let total = 0;
  for (const rel of found) {
    if (files.length >= MAX_FILES || total >= MAX_TOTAL_CHARS) {
      skipped.push({ path: rel, reason: 'size limit' });
      continue;
    }
    let text = fs.readFileSync(path.join(folder, rel), 'utf8');
    if (text.includes('\u0000')) continue; // binary after all
    if (text.length > MAX_FILE_CHARS) text = text.slice(0, MAX_FILE_CHARS) + '\n…(truncated)';
    files.push({ path: rel, text });
    total += text.length;
  }

  const token = crypto.randomUUID();
  const name = path.basename(folder);
  pending.set(token, { folder, name, files });
  return {
    token,
    name,
    folder,
    fileCount: files.length,
    totalChars: total,
    files: files.map((f) => f.path),
    skipped,
  };
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overview',
    'techStack',
    'architecture',
    'fileGuide',
    'keyDecisions',
    'likelyQuestions',
    'weakSpots',
    'improvements',
    'terms',
  ],
  properties: {
    overview: { type: 'string', description: '3-5 simple sentences: what the project does and how it is organized.' },
    techStack: { type: 'array', items: { type: 'string' } },
    architecture: { type: 'string', description: 'How the main parts fit together, mentioning real file paths.' },
    keyDecisions: {
      type: 'array',
      description: 'Up to 6 design decisions an interviewer is likely to ask about.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['decision', 'why', 'howToSay'],
        properties: {
          decision: { type: 'string' },
          why: { type: 'string', description: 'The likely reason, based on the code.' },
          howToSay: { type: 'string', description: 'One or two easy spoken sentences, first person.' },
        },
      },
    },
    likelyQuestions: {
      type: 'array',
      description: 'Up to 8 questions an interviewer would ask about this code, with a short spoken answer.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'answer'],
        properties: { question: { type: 'string' }, answer: { type: 'string' } },
      },
    },
    weakSpots: {
      type: 'array',
      description:
        'Up to 5 honest weaknesses (missing tests, error handling, scaling…) and how to talk about them calmly.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['issue', 'howToAddress'],
        properties: { issue: { type: 'string' }, howToAddress: { type: 'string' } },
      },
    },
    improvements: {
      type: 'array',
      items: { type: 'string' },
      description: '"With more time I would…" talking points.',
    },
    fileGuide: {
      type: 'array',
      description:
        'Up to 25 of the most important files, with the main functions/components in each. Used to find code during the interview.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'purpose', 'symbols'],
        properties: {
          path: { type: 'string', description: 'Exact relative path as given in the FILE headers.' },
          purpose: { type: 'string', description: 'One short sentence.' },
          symbols: {
            type: 'array',
            items: { type: 'string' },
            description: 'Main function, class or component names in this file.',
          },
        },
      },
    },
    terms: {
      type: 'array',
      description: 'Up to 10 technical words from this project that are hard to pronounce or explain.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'pronunciation', 'meaning'],
        properties: {
          term: { type: 'string' },
          pronunciation: { type: 'string', description: 'Simple syllables with the stressed part in CAPITALS.' },
          meaning: { type: 'string' },
        },
      },
    },
  },
};

const store = () => dataFile('project-analyses.json');

function listSaved() {
  try {
    return JSON.parse(fs.readFileSync(store(), 'utf8'));
  } catch {
    return [];
  }
}

function writeSaved(items) {
  writeJson(store(), items);
}

async function analyze(token, ai, profile) {
  const project = pending.get(token);
  if (!project) throw new Error('Please choose the folder again.');
  const code = project.files.map((f) => `=== FILE: ${f.path} ===\n${f.text}`).join('\n\n');

  const analysis = await ai.json({
    name: 'project_prep',
    schema: ANALYSIS_SCHEMA,
    effort: 'medium',
    instructions: `You help a non-native English speaker prepare to present and discuss a take-home project they built
for a job interview. Explain everything in simple, clear English (B2 level), short sentences.
Base every statement on the code provided; mention real file paths. If something is unclear from the code, say so.
Suggested spoken sentences should sound natural and casual, in the first person.`,
    input: `CANDIDATE BACKGROUND (for context):
${profile?.resume?.slice(0, 3000) || '(not provided)'}

JOB DESCRIPTION (for context):
${profile?.jobDescription?.slice(0, 3000) || '(not provided)'}

PROJECT "${project.name}" (${project.files.length} files):
${code}`,
  });

  pending.delete(token);
  const item = { id: crypto.randomUUID(), name: project.name, folder: project.folder, createdAt: Date.now(), analysis };
  writeSaved([item, ...listSaved()].slice(0, 20));
  return item;
}

function get(id) {
  return listSaved().find((i) => i.id === id) || null;
}

// Short summary of a project for the live answer prompt (no code, so requests stay small).
function brief(item) {
  if (!item) return '';
  const a = item.analysis;
  const lines = [
    `Project: ${item.name}`,
    a.overview,
    `Tech stack: ${a.techStack.join(', ')}`,
    `Architecture: ${a.architecture}`,
    'Key decisions:',
    ...a.keyDecisions.map((d) => `- ${d.decision} (why: ${d.why})`),
    'Known weak spots:',
    ...a.weakSpots.map((w) => `- ${w.issue}`),
  ];
  if (a.fileGuide?.length) {
    lines.push('Files:', ...a.fileGuide.map((f) => `- ${f.path}: ${f.purpose} [${f.symbols.join(', ')}]`));
  }
  return lines.join('\n');
}

/* ---------- finding code during the interview ---------- */

const STOPWORDS = new Set(
  (
    'a an the and or but if then so to of in on at for with by from as is are was were be been it its this that these those ' +
    'you your we our i me my how what why when where which who did do does done can could would should will just about ' +
    'tell walk through explain show code file files project part use used using make made there here have has had any some'
  ).split(' '),
);
const CONTEXT_LINES = 14; // lines shown around a match
const MAX_SNIPPET_LINES = 40;

const fileCache = new Map(); // folder -> { at, files: [relative paths] }
function projectFiles(folder) {
  const cached = fileCache.get(folder);
  if (cached && Date.now() - cached.at < 60000) return cached.files;
  const files = walk(folder).found;
  fileCache.set(folder, { at: Date.now(), files });
  return files;
}

// Reads a project file only if it is inside the folder and allowed by the same filters as the scan.
function readProjectFile(folder, rel) {
  const allowed = projectFiles(folder);
  const clean = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!allowed.includes(clean)) return null;
  const full = path.resolve(folder, clean);
  if (!full.startsWith(path.resolve(folder) + path.sep)) return null;
  try {
    return fs.readFileSync(full, 'utf8');
  } catch {
    return null;
  }
}

// A window of lines around the line that best matches `terms` (a symbol name or keywords).
function snippet(text, terms) {
  const lines = text.split(/\r?\n/);
  let best = -1;
  let bestScore = 0;
  lines.forEach((line, i) => {
    const l = line.toLowerCase();
    let score = 0;
    // A definition line ("function foo", "class Foo") beats a line that merely uses the name.
    for (const t of terms)
      if (l.includes(t)) score += /\b(function|class|const|def|export|interface|type)\b/.test(l) ? 3 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  const start = best < 0 ? 0 : Math.max(0, best - 3);
  const end = Math.min(lines.length, start + (best < 0 ? MAX_SNIPPET_LINES : CONTEXT_LINES + 3));
  return { startLine: start + 1, code: lines.slice(start, end).join('\n'), score: bestScore };
}

const keywords = (text) =>
  [...new Set(text.toLowerCase().match(/[a-z_][a-z0-9_]{2,}/g) || [])].filter((w) => !STOPWORDS.has(w));

/**
 * Code from the active project that relates to an interview question.
 * refs: [{ path, symbol }] named by the model; query: the question text for a quick local keyword search.
 * Runs entirely on this PC; nothing here is sent anywhere.
 */
function related({ id, query = '', refs = [] }) {
  const item = get(id);
  if (!item || !fs.existsSync(item.folder)) return [];
  const results = [];

  for (const ref of refs.slice(0, 3)) {
    const text = readProjectFile(item.folder, ref.path);
    if (text == null) continue;
    // "start, stop" or "useCart / commit": look for each name; the first definition found wins.
    const symbols = ref.symbol
      .toLowerCase()
      .split(/[\s,/|]+/)
      .filter((w) => w.length > 1);
    const terms = symbols.length ? symbols : keywords(query);
    results.push({ path: ref.path.replace(/\\/g, '/'), symbol: ref.symbol || '', ...snippet(text, terms) });
  }
  if (results.length || !query) return results;

  // No model references yet: score files by question keywords (file names count more than contents).
  const terms = keywords(query);
  if (!terms.length) return [];
  const scored = [];
  for (const rel of projectFiles(item.folder)) {
    const text = readProjectFile(item.folder, rel);
    if (text == null) continue;
    const name = rel.toLowerCase();
    const lower = text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (name.includes(t)) score += 5;
      const hits = lower.split(t).length - 1;
      score += Math.min(hits, 5);
    }
    if (score > 0) scored.push({ rel, text, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ rel, text }) => ({ path: rel, symbol: '', ...snippet(text, terms) }));
}

function remove(id) {
  writeSaved(listSaved().filter((i) => i.id !== id));
}

function clearAll() {
  fs.rmSync(store(), { force: true });
}

module.exports = { scan, analyze, listSaved, get, brief, related, remove, clearAll };
