const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'live-captions.ps1');

let child = null;

// Starts reading Windows Live Captions; calls onEvent({ status }) or onEvent({ text }).
function start(onEvent) {
  stop();
  child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    windowsHide: true,
  });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      onEvent(JSON.parse(line));
    } catch {
      // Ignore anything that isn't one of our JSON lines.
    }
  });
  child.stderr.on('data', (d) => console.error('[live-captions]', d.toString().trim()));
  const proc = child;
  proc.on('exit', (code) => {
    if (child === proc) {
      child = null;
      onEvent({ status: 'stopped', code });
    }
  });
}

function stop() {
  const proc = child;
  child = null;
  proc?.kill();
}

module.exports = { start, stop };
