import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { extractText } = require('../server/importers.cjs');

// A minimal one-page PDF with one line of text per entry in `lines`.
function makePdf(lines) {
  const content = lines.map((l, i) => `BT /F1 12 Tf 72 ${720 - i * 20} Td (${l}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test('text is read from a PDF', async () => {
  const text = await extractText('resume.PDF', makePdf(['Jane Doe', 'Frontend developer, React']));
  assert.match(text, /Jane Doe/);
  assert.match(text, /Frontend developer, React/);
});

test('a damaged PDF gives a clear message', async () => {
  await assert.rejects(extractText('resume.pdf', Buffer.from('not a pdf at all')), /could not be read/);
});

test('text files are cleaned up: Windows line breaks, trailing spaces, extra blank lines', async () => {
  const text = await extractText('job.txt', Buffer.from('  Title  \r\nLine one   \r\n\r\n\r\n\r\nLine two\r\n'));
  assert.equal(text, 'Title\nLine one\n\nLine two');
});

test('old .doc files and empty files are refused with a hint', async () => {
  await assert.rejects(extractText('cv.doc', Buffer.from('x')), /\.docx or PDF/);
  await assert.rejects(extractText('cv.txt', Buffer.from('  \n ')), /No text found/);
});
