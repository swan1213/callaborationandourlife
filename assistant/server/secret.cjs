const { execFileSync } = require('node:child_process');

// The API key is encrypted with Windows DPAPI (current user) before it is written to settings.json.
// Node has no DPAPI binding, so PowerShell does the work. Other systems store the key as is.
const PREFIX = 'dpapi:';
const isWindows = process.platform === 'win32';

function powershell(script, input) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
  }).trim();
}

const PROTECT = `Add-Type -AssemblyName System.Security
$b = [Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd())
[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b, $null, 'CurrentUser'))`;

const UNPROTECT = `Add-Type -AssemblyName System.Security
$b = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b, $null, 'CurrentUser'))`;

// Each PowerShell call takes a few hundred ms and settings are read often: remember results.
const plain = new Map(); // stored value -> plain text

function encrypt(value) {
  if (!value || !isWindows) return value || '';
  for (const [stored, text] of plain) if (text === value) return stored;
  try {
    const stored = PREFIX + powershell(PROTECT, value);
    plain.set(stored, value);
    return stored;
  } catch {
    return value; // DPAPI unavailable: keep the key usable rather than losing it
  }
}

function decrypt(value) {
  if (!value) return '';
  // 'enc:' values were encrypted by the old desktop app with Electron's own key; they can't be read here.
  if (value.startsWith('enc:')) return '';
  if (!value.startsWith(PREFIX)) return value;
  if (plain.has(value)) return plain.get(value);
  let text = '';
  try {
    text = powershell(UNPROTECT, value.slice(PREFIX.length));
  } catch {}
  plain.set(value, text);
  return text;
}

module.exports = { encrypt, decrypt };
