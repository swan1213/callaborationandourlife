// Prepares the Windows app before electron-builder packs it:
// - desktop/config.json: the TailorBid site allowed to connect (APP_URL) and the assistant's address
//   (NEXT_PUBLIC_ASSISTANT_URL), from TailorBid's .env.local or the environment. Public values only:
//   no keys or secrets ever go into the installer.
// - the app and tray icons, drawn from public/favicon.svg.
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

let env = {};
try {
  env = parseEnv(fs.readFileSync(path.join(root, '..', '.env.local'), 'utf8'));
} catch {
  // No .env.local (e.g. a build machine): the environment variables below must be set.
}
const config = {
  APP_URL: process.env.APP_URL || env.APP_URL || '',
  NEXT_PUBLIC_ASSISTANT_URL:
    process.env.NEXT_PUBLIC_ASSISTANT_URL || env.NEXT_PUBLIC_ASSISTANT_URL || 'http://127.0.0.1:4317',
};
if (!/^https:\/\//.test(config.APP_URL)) {
  console.error('APP_URL must be the live TailorBid site (https://…), in .env.local or the environment.');
  process.exit(1);
}
fs.writeFileSync(path.join(here, 'config.json'), JSON.stringify(config, null, 2) + '\n');
console.log('desktop/config.json:', config);

const svg = fs.readFileSync(path.join(root, 'public', 'favicon.svg'));
const png = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
fs.mkdirSync(path.join(here, 'build'), { recursive: true });
fs.writeFileSync(path.join(here, 'build', 'icon.png'), png(512)); // installer and app icon
fs.writeFileSync(path.join(here, 'tray.png'), png(32));
fs.writeFileSync(path.join(here, 'tray@2x.png'), png(64)); // sharp on high-DPI screens
console.log('icons written');
