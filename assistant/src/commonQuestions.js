// Interview questions that come up in almost every interview. Answers to these are prepared in the
// background when listening starts, so they can be shown instantly instead of waiting for the model.
// Patterns are deliberately strict: a wrong instant answer is worse than a 2-second wait.
export const COMMON_QUESTIONS = [
  {
    id: 'about-yourself',
    question: 'Tell me about yourself.',
    // "your background/experience" only when the sentence ends there: not "your experience with GraphQL".
    pattern:
      /\b(tell|walk) (me|us) (a (little )?(bit )?)?(more )?(about|through) (yourself|your resume|your cv|your (background|experience)(?=\s*[?.!]?\s*$))|\bintroduce yourself\b/,
  },
  {
    id: 'why-company',
    question: 'Why do you want to work here?',
    pattern:
      /\bwhy (do|would) you want to (work (here|for us|with us|at)|join)\b|\bwhy (are you|you're) interested in (this|the|our) (role|position|job|company|team)\b|\bwhy did you apply\b|\bwhy (this|our) company\b/,
  },
  {
    id: 'why-hire',
    question: 'Why should we hire you?',
    pattern: /\bwhy should (we|i) hire you\b|\bwhat makes you (a good|the right|the best) (fit|candidate|person)\b/,
  },
  {
    id: 'strengths-weaknesses',
    question: 'What are your strengths and weaknesses?',
    pattern: /\bstrengths? and (your )?weakness(es)?\b/,
  },
  {
    id: 'weakness',
    question: 'What is your biggest weakness?',
    pattern: /\b(your|any) (biggest |greatest |main |key )?weakness(es)?\b|\barea(s)? (for|of) improvement\b/,
  },
  {
    id: 'strength',
    question: 'What are your greatest strengths?',
    pattern: /\b(your|any) (biggest |greatest |main |key )?strengths?\b(?!.*weakness)/,
  },
  {
    id: 'why-leaving',
    question: 'Why are you leaving your current job?',
    pattern:
      /\bwhy (are|did) you (leav|looking|look)|\bwhy (do|did) you want to leave\b|\breason (for|why you('re| are)) leaving\b/,
  },
  {
    id: 'five-years',
    question: 'Where do you see yourself in five years?',
    pattern: /\b(five|5) years\b|\bsee yourself in\b|\blong[- ]term (career )?goals\b/,
  },
  {
    id: 'conflict',
    question: 'Tell me about a time you had a conflict with a teammate.',
    pattern: /\b(conflict|disagree(d|ment)?)\b.*\b(team ?mate|colleague|co-?worker|manager|boss|team member)s?\b/,
  },
  {
    id: 'failure',
    question: 'Tell me about a time you failed or made a mistake.',
    pattern: /\ba time (when )?you (failed|made a mistake)\b|\b(biggest|worst) (failure|mistake)\b/,
  },
  {
    id: 'proud',
    question: 'What achievement are you most proud of?',
    pattern: /\b(most proud|proudest)\b|\b(biggest|greatest) (achievement|accomplishment)\b/,
  },
  {
    id: 'salary',
    question: 'What are your salary expectations?',
    pattern:
      /\bsalary (expectations?|range|requirements?)\b|\b(expected|expectations? for) (salary|compensation|pay)\b/,
  },
  {
    id: 'questions-for-us',
    question: 'Do you have any questions for us?',
    pattern:
      /\b(do|did) you have any (other |more |final )?questions\b|\banything (else )?you('d| would) like to ask\b/,
  },
];

export function matchCommonQuestion(text) {
  const t = text.toLowerCase().replace(/[’']/g, "'");
  return COMMON_QUESTIONS.find((q) => q.pattern.test(t)) || null;
}

// A natural opener the candidate can say immediately while the full answer loads, buying a second or two
// the way people do. Several for each kind of question, and never the same one twice in a row: an
// interviewer notices "Yeah, good question. So…" before every answer. They stay vague on purpose
// ("Hmm, let me think…", never "Yes, I have…"): the answer isn't known yet when one is shown.
const OPENERS = [
  [
    /\b(tell|walk) (me|us) (a (little )?(bit )?)?(about|through) (yourself|your resume|your cv|your background)|introduce yourself/,
    ['Sure. So…', 'Yeah, of course. So…', 'Okay, so a bit about me…', 'Sure, happy to. So…', 'Yeah. So, quickly…'],
  ],
  [
    /\bweakness/,
    ['Hmm, honestly…', "That's a fair one. I'd say…", 'Okay, let me be honest here…', 'Hmm. For me, probably…'],
  ],
  [/\bstrength/, ["I'd say probably…", 'Hmm, I think…', 'Probably the biggest one is…', 'Okay, if I had to pick one…']],
  [
    /\btell (me|us) about a time|give (me|us) an example|describe a (time|situation)|walk (me|us) through (a|an|the)\b/,
    [
      'Yeah, let me think of a good one… So,',
      'Hmm, okay, one that comes to mind…',
      'Okay, so a good example would be…',
      'Right, so there was this one time…',
      'Mm, let me pick a good one…',
    ],
  ],
  [
    /\bany (other |more |final )?questions/,
    ['Yeah, actually, I do…', 'Sure, a couple, actually…', 'Yeah, I was curious about…'],
  ],
  [/\bwhy\b/, ['Yeah, honestly…', 'Hmm, a few reasons, really…', 'Honestly, for me…', 'Good question, actually. So…']],
  // Practical questions (salary, notice period, location, visa): short and plain.
  [
    /\b(salary|compensation|expectations?|notice period|availability|available to start|start date|relocat\w*|visa|sponsorship|based|located|citizen\w*)\b/,
    ['Sure. So…', 'Okay, so…', 'Yeah, so…', 'Right, so…'],
  ],
  [
    /\b(explain|difference between|how does .+ work|what (is|are) (a|an|the)\b|walk (me|us) through how)\b/,
    ['Okay, so basically…', 'Right, so…', 'So, the way I see it…', 'Mm, so in short…', 'Sure. So basically…'],
  ],
  [
    /\bhow (would|will|do|did) you|what would you|what do you do\b/,
    ['So, usually…', 'Okay, so I think…', 'Hmm, so first…'],
  ],
];
// For everything else.
const GENERAL = [
  'Hmm, okay…',
  'Right, so…',
  'Okay, so…',
  'Mm, let me think…',
  'Sure. So…',
  'Yeah, so…',
  'Okay, yeah…',
  'Hmm, so…',
  'Right. Well…',
  "That's a good one. So…",
];

const firstWord = (s) => s.toLowerCase().match(/[a-z']+/)?.[0] ?? '';

/**
 * An opener for `question` that wasn't used for any of the `recent` questions (newest last) and doesn't
 * start with the same word as the last one. `random` is injectable for tests.
 */
export function openerFor(question, recent = [], random = Math.random) {
  const t = question.toLowerCase();
  const pool = OPENERS.find(([re]) => re.test(t))?.[1] ?? [];
  const last = recent.at(-1);
  const fresh = (o) => !recent.includes(o) && (!last || firstWord(o) !== firstWord(last));
  const choices = [...pool.filter(fresh), ...(pool.filter(fresh).length < 2 ? GENERAL.filter(fresh) : [])];
  const list = choices.length ? choices : GENERAL.filter((o) => o !== last);
  return list[Math.floor(random() * list.length)];
}
