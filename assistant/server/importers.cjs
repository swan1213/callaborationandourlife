const path = require('node:path');

const MAX_CHARS = 20000; // plenty for a resume or job post; keeps prompts small

// Extracts plain text from an uploaded PDF, Word (.docx) or text file.
async function extractText(fileName, buffer) {
  const ext = path.extname(fileName).toLowerCase();
  let text;

  if (ext === '.pdf') {
    // Loaded on first use: pdf.js is large and most runs never import a PDF.
    const { extractText: pdfText } = await import('unpdf');
    try {
      text = (await pdfText(new Uint8Array(buffer), { mergePages: true })).text;
    } catch (err) {
      throw new Error(
        'This PDF could not be read. It may be damaged or password-protected; try Word or paste the text.',
        {
          cause: err,
        },
      );
    }
  } else if (ext === '.docx') {
    const mammoth = require('mammoth');
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (ext === '.doc') {
    throw new Error('Old .doc files are not supported. Save it as .docx or PDF first.');
  } else {
    text = buffer.toString('utf8');
  }

  text = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) throw new Error('No text found in this file. If it is a scanned PDF, copy and paste the text instead.');
  return text.slice(0, MAX_CHARS);
}

module.exports = { extractText };
