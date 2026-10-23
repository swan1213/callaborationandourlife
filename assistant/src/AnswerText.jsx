// Renders a spoken answer as numbered paragraphs (pause between them), one sentence per line,
// with [cue] markers shown as small icon labels.
// Keep the names in sync with CUES in server/prompts.cjs. Also listed in Setup → Live features.
export const CUES = {
  smile: '🙂',
  nod: '🙂‍↕️',
  pause: '⏸️',
  'open hands': '👐',
  'hand on chest': '🫶',
  'count on fingers': '☝️',
  'lean in': '↗️',
  'eye contact': '👀',
  'warm tone': '☀️',
  'confident tone': '💪',
  'thinking look': '🤔',
  'laugh lightly': '😄',
  'deep breath': '😮‍💨',
  'slow down': '🐢',
  emphasize: '❗',
  'excited tone': '🤩',
  'calm tone': '😌',
  'humble tone': '🙏',
  'serious tone': '😐',
  'look at camera': '📷',
  'point to screen': '👉',
  'thumbs up': '👍',
  'sit up straight': '🪑',
};

// Paragraphs are separated by an empty line in the model output.
const splitParagraphs = (text) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

// Prefer the model's line breaks; fall back to splitting on sentence endings.
const splitSentences = (paragraph) =>
  paragraph
    .split('\n')
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[[A-Z"'])/))
    .map((s) => s.trim())
    .filter(Boolean);

function Sentence({ text }) {
  const parts = text.split(/(\[[^\]\n]{1,30}\])/);
  return parts.map((part, i) => {
    const cue = part.match(/^\[([^\]]+)\]$/)?.[1];
    if (!cue) return part;
    const key = cue.toLowerCase().trim();
    return (
      <span key={i} className="cue" title="Delivery cue">
        {CUES[key] || '✋'} {key}
      </span>
    );
  });
}

export default function AnswerText({ text, className = 'spoken' }) {
  const paragraphs = splitParagraphs(text);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <div key={i} className="paragraph">
          {paragraphs.length > 1 && <span className="paragraph-no">{i + 1}</span>}
          <div className="paragraph-body">
            {splitSentences(p).map((s, j) => (
              <div key={j} className="sentence">
                <Sentence text={s} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
