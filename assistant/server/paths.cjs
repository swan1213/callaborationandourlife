const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Where settings, sessions and prep sheets are kept. The same folder the desktop version used,
// so an existing profile, interview history and prep sheets carry over. IA_DATA_DIR overrides it.
const dataDir =
  process.env.IA_DATA_DIR ||
  (process.env.APPDATA
    ? path.join(process.env.APPDATA, 'Interview Assistant')
    : path.join(os.homedir(), '.interview-assistant'));

const dataFile = (...parts) => path.join(dataDir, ...parts);

// Writes JSON to a temp file first and then renames it over the old one, so a crash or a full disk
// mid-write never leaves a half-written file (an empty settings.json would lose the whole profile).
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { dataDir, dataFile, writeJson };
