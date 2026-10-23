const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { execFileSync, spawn } = require('node:child_process');
const { dataFile } = require('./paths.cjs');

// Global hotkeys (server/hotkeys.ps1), registered while at least one app tab is open.
// Events sent to every open tab: { hotkey: 'answer' | 'view' | 'hide' } or { notice: text }.
const SCRIPT = path.join(__dirname, 'hotkeys.ps1');
const RELEASE_AFTER_MS = 3000; // a page reload doesn't release and re-register the keys
// Windows hidden with Ctrl+Shift+H, saved so they are shown again even if the server is killed
// (Windows kills the script along with it, before it can show them itself).
const HIDDEN_FILE = dataFile('hidden-windows.json');

const subscribers = new Set();
let child = null;
let notice = '';
let hidden = []; // window handles hidden with Ctrl+Shift+H
let releaseTimer = null;

const broadcast = (event) => subscribers.forEach((send) => send(event));

function takenNotice(taken) {
  if (!taken.length) return '';
  const many = taken.length > 1;
  return `${taken.join(' and ')} ${many ? 'are' : 'is'} already used by another program, so ${
    many ? 'these hotkeys only work' : 'this hotkey only works'
  } while the app has focus. Close that program and restart the app.`;
}

function start(windowMarks) {
  if (process.platform !== 'win32') return;
  const proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT],
    {
      windowsHide: true,
      env: { ...process.env, IA_PARENT_PID: String(process.pid), IA_WINDOW_MARKS: windowMarks.join('|') },
    },
  );
  child = proc;
  readline.createInterface({ input: proc.stdout }).on('line', (line) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return; // not one of our JSON lines
    }
    if (event.taken) {
      notice = takenNotice(event.taken);
      if (notice) broadcast({ notice });
    } else if (event.hidden) setHidden(event.hidden);
    else if (event.hotkey) broadcast({ hotkey: event.hotkey });
  });
  proc.stderr.on('data', (d) => console.error('[hotkeys]', d.toString().trim()));
  proc.on('exit', () => {
    if (child === proc) child = null;
  });
}

function setHidden(handles) {
  hidden = handles;
  try {
    if (hidden.length) {
      fs.mkdirSync(path.dirname(HIDDEN_FILE), { recursive: true });
      fs.writeFileSync(HIDDEN_FILE, JSON.stringify(hidden));
    } else fs.rmSync(HIDDEN_FILE, { force: true });
  } catch {}
}

// Stopping the script skips its own clean-up, so windows it hid are shown again here.
// Also called at start-up for windows left hidden by a server that was killed.
function showHidden() {
  if (!hidden.length) {
    try {
      // Window handles are only valid until the PC restarts; older ones may now belong to other windows.
      const bootedAt = Date.now() - require('node:os').uptime() * 1000;
      if (fs.statSync(HIDDEN_FILE).mtimeMs > bootedAt) hidden = JSON.parse(fs.readFileSync(HIDDEN_FILE, 'utf8'));
      else fs.rmSync(HIDDEN_FILE, { force: true });
    } catch {}
  }
  if (!hidden.length) return;
  const script = `Add-Type -Name W -Namespace IA -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);'
foreach ($h in $env:IA_HIDDEN.Split(',')) { [void][IA.W]::ShowWindow([IntPtr][long]$h, 4) }`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: 15000,
      env: { ...process.env, IA_HIDDEN: hidden.join(',') },
    });
  } catch {}
  setHidden([]);
}

function stop() {
  const proc = child;
  child = null;
  notice = '';
  proc?.kill();
  showHidden();
}

// send(event) is called for every hotkey; returns an unsubscribe function.
function subscribe(send, windowMarks) {
  clearTimeout(releaseTimer);
  subscribers.add(send);
  if (!child) start(windowMarks);
  else if (notice) send({ notice });
  return () => {
    subscribers.delete(send);
    if (!subscribers.size) releaseTimer = setTimeout(stop, RELEASE_AFTER_MS);
  };
}

module.exports = { subscribe, stop, showHidden };
