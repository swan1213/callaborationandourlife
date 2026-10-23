import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-project-'));
process.env.IA_DATA_DIR = path.join(root, 'data');
const require = createRequire(import.meta.url);
const folder = path.join(root, 'shop');
let projectAnalyzer;

const write = (rel, text) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
};

before(() => {
  write('shop/README.md', '# Shop\nA tiny shop.');
  write(
    'shop/src/cart.js',
    'import x from "y";\n\nexport function addItem(cart, item) {\n  cart.items.push(item);\n}\n',
  );
  write('shop/src/checkout.js', 'export const pay = () => {};\n');
  write('shop/.env', 'STRIPE_KEY=sk_live_secret');
  write('shop/server.key', 'PRIVATE KEY');
  write('shop/config/secrets.json', '{"token":"x"}');
  write('shop/node_modules/lib/index.js', 'module.exports = 1;');
  write('shop/package-lock.json', '{}');
  write('outside/other.js', 'export function addItem() {}');

  projectAnalyzer = require('../server/projectAnalyzer.cjs');
  fs.mkdirSync(process.env.IA_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.IA_DATA_DIR, 'project-analyses.json'),
    JSON.stringify([{ id: 'p1', name: 'shop', folder, createdAt: 0, analysis: {} }]),
  );
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

test('scan sends source files only: no secrets, dependencies or lock files', () => {
  const result = projectAnalyzer.scan(folder);
  assert.deepEqual(result.files, ['README.md', 'src/cart.js', 'src/checkout.js']); // README first
  const skipped = result.skipped.map((s) => s.path);
  for (const secret of ['.env', 'server.key', 'config/secrets.json']) assert.ok(skipped.includes(secret), secret);
});

test('related code is found by the file and symbol the answer names', () => {
  const [hit] = projectAnalyzer.related({ id: 'p1', refs: [{ path: 'src\\cart.js', symbol: 'addItem()' }] });
  assert.equal(hit.path, 'src/cart.js');
  assert.equal(hit.startLine, 1);
  assert.match(hit.code, /export function addItem/);
});

test('related code falls back to a keyword search of the question', () => {
  const hits = projectAnalyzer.related({ id: 'p1', query: 'How does the cart work?' });
  assert.equal(hits[0].path, 'src/cart.js');
});

test('related code never reads outside the project folder or secret files', () => {
  for (const ref of [
    '../outside/other.js',
    path.join(root, 'outside', 'other.js'),
    'src/../../outside/other.js',
    '.env',
    'server.key',
    'node_modules/lib/index.js',
  ]) {
    assert.deepEqual(projectAnalyzer.related({ id: 'p1', refs: [{ path: ref, symbol: 'addItem' }] }), [], ref);
  }
});

test('related code is empty for an unknown project', () => {
  assert.deepEqual(projectAnalyzer.related({ id: 'nope', query: 'cart' }), []);
});
