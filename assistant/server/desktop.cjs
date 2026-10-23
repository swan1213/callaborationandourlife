const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

// The few things the browser can't do itself, done on this PC by the local server.

// Shows the Windows folder picker and resolves with the chosen path, or null if cancelled.
// A browser can only upload a folder's files, but the take-home project must be read from disk
// later during the interview, so the server needs the real path.
function pickFolder(title) {
  if (process.platform !== 'win32') return Promise.reject(new Error('Choosing a folder is only supported on Windows.'));
  const script = `Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = $env:IA_DIALOG_TITLE
$dialog.ShowNewFolderButton = $false
if ($dialog.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($dialog.SelectedPath) }`;
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
      { encoding: 'utf8', windowsHide: true, env: { ...process.env, IA_DIALOG_TITLE: title } },
      (err, stdout) => (err ? reject(new Error('Could not open the folder picker.')) : resolve(stdout.trim() || null)),
    );
  });
}

// Opens Explorer with the file selected (or its folder, if the file doesn't exist yet).
function showInFolder(file) {
  if (process.platform !== 'win32') return;
  const args = fs.existsSync(file) ? `/select,"${file}"` : `"${path.dirname(file)}"`;
  spawn('explorer.exe', [args], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore' }).unref();
}

// Opens a URL in the default browser.
function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd.exe', ['/c', 'start', '""', url]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
}

module.exports = { pickFolder, showInFolder, openBrowser };
