// Keyword match between a job description and the generated resume / cover letter.
// Client-safe and deterministic (no AI call): an estimate of how an ATS keyword filter would see the documents.

import type { ResumeContent } from "./generate";
import { roleOnly } from "./headline";

/* ------------------------------------------------------------------ dictionary */

/** Canonical skill name → extra spellings that count as the same skill. */
const SKILLS: Record<string, string[]> = {
  // languages
  JavaScript: ["js", "ecmascript", "es6"], TypeScript: ["ts"], Python: [], Java: [], Go: ["golang"], Rust: [], "C++": ["cpp"], "C#": ["csharp", "c sharp"], C: [],
  Ruby: [], PHP: [], Kotlin: [], Swift: [], "Objective-C": [], Scala: [], Elixir: [], Erlang: [], Haskell: [], Clojure: [], Dart: [], R: [], Julia: [], Perl: [],
  SQL: [], Bash: ["shell scripting"], PowerShell: [], Lua: [], Solidity: [], MATLAB: [], Groovy: [],
  // frontend
  React: ["react.js", "reactjs"], "React Native": [], "Next.js": ["nextjs"], Vue: ["vue.js", "vuejs"], Nuxt: ["nuxt.js"], Angular: ["angularjs"], Svelte: ["sveltekit"],
  Redux: [], HTML: ["html5"], CSS: ["css3"], Sass: ["scss"], "Tailwind CSS": ["tailwind"], Webpack: [], Vite: [], "Design systems": ["design system"],
  Accessibility: ["a11y", "wcag"], Storybook: [], jQuery: [],
  // backend & frameworks
  "Node.js": ["node", "nodejs"], Express: ["express.js"], NestJS: [], Django: [], Flask: [], FastAPI: [], "Spring Boot": ["spring"], Rails: ["ruby on rails"],
  Laravel: [], ".NET": ["dotnet", "asp.net", ".net core"], GraphQL: [], gRPC: [], REST: ["restful", "rest api", "rest apis"], WebSockets: ["websocket"],
  Microservices: ["microservice"], "Event-driven architecture": ["event driven", "event-driven"], "Distributed systems": ["distributed system"],
  "System design": [], OAuth: ["oauth2", "oauth 2.0"], OpenAPI: ["swagger"],
  // data stores & streaming
  PostgreSQL: ["postgres", "psql"], MySQL: [], MariaDB: [], "SQL Server": ["mssql", "microsoft sql server"], Oracle: [], SQLite: [], MongoDB: ["mongo"],
  Redis: [], Cassandra: [], DynamoDB: [], Elasticsearch: ["elastic search", "opensearch"], Neo4j: [], Firestore: [], CockroachDB: [], Couchbase: [],
  Kafka: ["apache kafka"], RabbitMQ: [], "Amazon SQS": ["sqs"], Kinesis: [], "Pub/Sub": ["pubsub"], NATS: [],
  // data & ML
  Spark: ["apache spark", "pyspark"], Hadoop: [], Airflow: ["apache airflow"], dbt: [], Snowflake: [], BigQuery: [], Redshift: [], Databricks: [], Flink: [],
  "ETL": ["elt", "data pipelines", "data pipeline"], Pandas: [], NumPy: [], "scikit-learn": ["sklearn"], PyTorch: [], TensorFlow: [], Keras: [], "Hugging Face": ["huggingface"],
  "Machine learning": ["ml"], "Deep learning": [], NLP: ["natural language processing"], "Computer vision": [], LLMs: ["llm", "large language models", "large language model"],
  "Generative AI": ["genai", "gen ai"], RAG: ["retrieval augmented generation", "retrieval-augmented generation"], LangChain: [], "Vector databases": ["vector database", "pinecone", "weaviate", "pgvector"],
  MLOps: [], MLflow: [], Kubeflow: [], "A/B testing": ["ab testing", "experimentation"], Tableau: [], "Power BI": ["powerbi"], Looker: [], Statistics: [],
  // cloud & infra
  AWS: ["amazon web services"], GCP: ["google cloud", "google cloud platform"], Azure: ["microsoft azure"], Lambda: ["aws lambda"], EC2: [], S3: [], ECS: [], EKS: [],
  CloudFormation: [], "Cloud Run": [], Kubernetes: ["k8s"], Docker: ["containers", "containerization"], Terraform: [], Pulumi: [], Ansible: [], Helm: [],
  Serverless: [], Linux: ["unix"], Nginx: [], "CI/CD": ["ci / cd", "continuous integration", "continuous delivery", "continuous deployment"],
  "GitHub Actions": [], Jenkins: [], CircleCI: [], GitLab: ["gitlab ci"], ArgoCD: ["argo cd"], Git: [], "Infrastructure as code": ["iac"],
  Prometheus: [], Grafana: [], Datadog: [], "New Relic": [], Splunk: [], OpenTelemetry: ["otel"], Observability: ["monitoring"], SRE: ["site reliability"],
  "Incident response": ["on-call", "on call"], Networking: ["tcp/ip", "dns"], Security: ["appsec", "application security"], IAM: [], "Zero trust": [],
  // practices & tools
  Agile: ["scrum", "kanban"], "Test-driven development": ["tdd"], "Unit testing": ["unit tests"], "Integration testing": ["integration tests"], Jest: [], Cypress: [],
  Playwright: [], Selenium: [], JUnit: [], pytest: [], "Code review": ["code reviews"], Mentoring: ["mentorship", "mentor"], Jira: [], Figma: [],
  "Performance optimization": ["performance tuning"], Scalability: ["scalable", "at scale"], "High availability": [], Caching: [], Concurrency: ["multithreading", "multi-threading"],
  "Data structures": [], Algorithms: [], "Object-oriented design": ["oop", "object oriented"], "Functional programming": [], "API design": [],
  Payments: ["payment systems", "fintech"], "E-commerce": ["ecommerce"], HIPAA: [], "PCI DSS": ["pci"], SOC2: ["soc 2"], GDPR: [],
  "Mobile development": [], iOS: [], Android: [], Unity: [], Blockchain: ["web3"],
};

const STOP = new Set(
  ("a about above across after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each " +
    "either else ever every few for from further had has have having he her here hers him his how i if in into is it its itself just least less let like made make many may me might " +
    "more most must my no nor not now of off on once only or other our ours out over own per please same she should so some such than that the their them then there these they this " +
    "those through to too under until up upon us very via was we well were what when where which while who whom why will with within without would yet you your yours " +
    "ability able across work working works team teams role roles job company companies candidate candidates experience experiences year years strong skills skill " +
    "including include includes new using use used plus etc help helps join looking build building built great good best high highly key based level levels day days " +
    "opportunity opportunities environment environments responsibilities responsibility requirements requirement qualifications qualification preferred required " +
    "benefits benefit salary pay range equal employer applicants application apply status disability veteran gender identity orientation race color religion national origin " +
    "including across within part full time remote hybrid office location locations us usa united states world global people customers customer product products " +
    "what you'll we're you're it's that's our we've they're who'll " +
    "service services system systems platform platforms software engineer engineers engineering backend frontend develop developing development " +
    "design designing solution solutions technology technologies tools tool support supporting understanding knowledge familiarity proven").split(/\s+/)
);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-term match that also works for C++, C#, .NET, Node.js, CI/CD … */
const termRe = (t: string) => new RegExp(`(?<![A-Za-z0-9+#])${esc(t).replace(/\\ /g, "[\\s-]+")}(?![A-Za-z0-9+#])`, "gi");

type Matcher = { name: string; res: RegExp[] };
const MATCHERS: Matcher[] = Object.entries(SKILLS).map(([name, aliases]) => ({
  name,
  // Single letters ("C", "R") only count in their exact capitalised form.
  res: [name, ...aliases].map((t) => (t.length <= 1 ? new RegExp(`(?<![A-Za-z0-9+#])${esc(t)}(?![A-Za-z0-9+#/])`, "g") : termRe(t))),
}));
const count = (text: string, m: Matcher) => m.res.reduce((n, re) => n + (text.match(re)?.length ?? 0), 0);

/** Skills implied by more specific ones in the documents (listing PostgreSQL shows SQL). */
const IMPLIED_BY: Record<string, string[]> = {
  SQL: ["PostgreSQL", "MySQL", "MariaDB", "SQL Server", "Oracle", "SQLite", "BigQuery", "Snowflake", "Redshift", "CockroachDB"],
  Docker: ["Kubernetes", "ECS", "EKS"],
  AWS: ["Lambda", "EC2", "S3", "ECS", "EKS", "DynamoDB", "Redshift", "Kinesis", "Amazon SQS", "CloudFormation"],
  GCP: ["BigQuery", "Cloud Run", "Firestore"],
  "Machine learning": ["Deep learning", "PyTorch", "TensorFlow", "scikit-learn"],
  "CI/CD": ["GitHub Actions", "Jenkins", "CircleCI", "ArgoCD"],
  JavaScript: ["TypeScript", "React", "Node.js", "Vue", "Angular"],
};

/* ------------------------------------------------------------------ job keywords */

/** `alts`: other skills the posting accepts instead ("Go or Java"); having any one of them counts. */
export type JobKeyword = { term: string; weight: number; required: boolean; mentions: number; alts?: string[] };

const REQUIRED_HEAD = /(requirement|qualification|must have|what you('|’)ll need|you have|you bring|who you are|minimum|basic qual|skills|what we('|’)re looking for)/i;
const PREFERRED_HEAD = /(preferred|nice to have|bonus|plus|good to have|desired|pluses)/i;
const OTHER_HEAD = /(benefits|perks|about us|about the company|compensation|salary|equal opportunity|why join)/i;

/** Splits the JD into lines tagged required / preferred / other by the nearest heading above. */
function sections(jd: string) {
  let mode: "required" | "preferred" | "other" | "body" = "body";
  return jd.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    const short = line.length <= 70 && !/[.;]$/.test(line);
    if (short && PREFERRED_HEAD.test(line)) mode = "preferred";
    else if (short && REQUIRED_HEAD.test(line)) mode = "required";
    else if (short && OTHER_HEAD.test(line)) mode = "other";
    return { line, mode };
  });
}

/** Hard skills (from the dictionary) and frequent domain phrases in the job description. */
export function jobKeywords(jd: string): { hard: JobKeyword[]; soft: string[] } {
  const lines = sections(jd || "");
  const hard: JobKeyword[] = [];
  for (const m of MATCHERS) {
    let mentions = 0, req = 0, pref = 0;
    for (const { line, mode } of lines) {
      const n = count(line, m);
      if (!n || mode === "other") continue;
      mentions += n;
      if (mode === "required") req += n;
      if (mode === "preferred") pref += n;
    }
    if (!mentions) continue;
    const required = req > 0 || (!pref && mentions > 1);
    const weight = (required ? 3 : pref ? 1 : 2) + Math.min(mentions - 1, 2) * 0.5;
    hard.push({ term: m.name, weight, required, mentions });
  }
  hard.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));

  // "Go or Java", "Python/Ruby", "Kafka or other …": skills joined by "or" / "/" in one line are alternatives.
  for (const { line } of lines) {
    const found = MATCHERS.map((m) => {
      let at = -1;
      for (const re of m.res) {
        re.lastIndex = 0;
        const hit = re.exec(line);
        if (hit && (at < 0 || hit.index < at)) at = hit.index;
      }
      return { name: m.name, at };
    })
      .filter((x) => x.at >= 0)
      .sort((a, b) => a.at - b.at);
    for (let i = 0; i + 1 < found.length; i++) {
      const gap = line.slice(found[i].at, found[i + 1].at).replace(/^\S+/, "");
      if (gap.length <= 14 && /(\bor\b|\/)/i.test(gap)) {
        const a = hard.find((k) => k.term === found[i].name), b = hard.find((k) => k.term === found[i + 1].name);
        if (a && b) {
          a.alts = [...new Set([...(a.alts ?? []), b.term, ...(b.alts ?? [])])];
          b.alts = [...new Set([...(b.alts ?? []), a.term, ...(a.alts ?? [])])].filter((t) => t !== b.term);
        }
      }
    }
  }

  // Domain phrases: two-word phrases and words that repeat in the JD and are not already skills.
  const body = lines.filter((l) => l.mode !== "other").map((l) => l.line).join(" ").toLowerCase();
  const words = body.match(/[a-z][a-z+#.-]{2,}/g) ?? [];
  const freq = new Map<string, number>();
  const known = new Set(Object.entries(SKILLS).flatMap(([k, a]) => [k, ...a]).map((s) => s.toLowerCase()));
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[.-]+$/, "");
    if (w.length >= 5 && !STOP.has(w) && !known.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
    const n = words[i + 1]?.replace(/[.-]+$/, "");
    if (n && !STOP.has(w) && !STOP.has(n) && w.length > 2 && n.length > 2 && !known.has(`${w} ${n}`)) {
      const bi = `${w} ${n}`;
      freq.set(bi, (freq.get(bi) ?? 0) + 1.5);
    }
  }
  const soft = [...freq.entries()]
    .filter(([t, n]) => n >= (t.includes(" ") ? 3 : 3))
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .filter((t, i, all) => !all.slice(0, i).some((p) => p.includes(t) || t.includes(p)))
    .slice(0, 10);
  return { hard, soft };
}

/* ------------------------------------------------------------------ scoring */

export type MatchCheck = { label: string; ok: boolean };
export type MatchResult = {
  score: number;
  matched: JobKeyword[];
  missing: JobKeyword[];
  softMatched: string[];
  softMissing: string[];
  checks: MatchCheck[];
};

export const matchLabel = (score: number) => (score >= 80 ? "Strong match" : score >= 65 ? "Good match" : score >= 45 ? "Fair match" : "Weak match");

const has = (text: string, term: string): boolean => {
  const m = MATCHERS.find((x) => x.name === term);
  if (m ? count(text, m) > 0 : termRe(term).test(text)) return true;
  return (IMPLIED_BY[term] ?? []).some((t) => { const x = MATCHERS.find((y) => y.name === t); return !!x && count(text, x) > 0; });
};
/** Whether `text` mentions the keyword (or a skill that implies it), exactly as the score counts it. */
export const mentionsKeyword = has;
const softHas = (text: string, phrase: string) => text.toLowerCase().includes(phrase);
const wordCount = (s: string) => (s.match(/\b[\w'’+#.-]+\b/g) ?? []).length;
const titleWords = (title: string) =>
  roleOnly(title)
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !["sr", "jr", "i", "ii", "iii", "iv"].includes(w));

/** All resume text in reading order. */
export function resumeText(r: ResumeContent) {
  return [
    r.headline, r.titleLine, r.summary,
    ...r.skills.flatMap((g) => [g.category, ...g.items]),
    ...r.experience.flatMap((e) => [e.title, e.company, e.description ?? "", ...e.bullets]),
    ...(r.projects ?? []).flatMap((p) => [p.name, p.description ?? "", ...(p.techStack ?? []), ...p.bullets]),
    ...r.education.flatMap((e) => [e.degree, e.field, e.university]),
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\*\*/g, "");
}

function coverage(text: string, hard: JobKeyword[], soft: string[]) {
  const direct = new Set(hard.filter((k) => has(text, k.term)).map((k) => k.term));
  // An alternative that is present satisfies the keyword ("Go or Java": Go alone is enough).
  const matched = hard.filter((k) => direct.has(k.term) || k.alts?.some((t) => direct.has(t)));
  const missing = hard.filter((k) => !matched.includes(k));
  const total = hard.reduce((a, k) => a + k.weight, 0);
  const got = matched.reduce((a, k) => a + k.weight, 0);
  const softMatched = soft.filter((p) => softHas(text, p));
  return {
    matched,
    missing,
    softMatched,
    softMissing: soft.filter((p) => !softMatched.includes(p)),
    hardRatio: total ? got / total : null,
    softRatio: soft.length ? softMatched.length / soft.length : null,
  };
}

/** Weighted average that ignores parts that could not be measured (null). */
function blend(parts: [number | null, number][]) {
  const used = parts.filter(([v]) => v !== null) as [number, number][];
  const w = used.reduce((a, [, x]) => a + x, 0);
  return w ? Math.round((100 * used.reduce((a, [v, x]) => a + v * x, 0)) / w) : 0;
}

export function scoreResume(r: ResumeContent, jd: string, jobTitle: string): MatchResult {
  const { hard, soft } = jobKeywords(jd);
  const text = resumeText(r);
  const c = coverage(text, hard, soft);
  const tw = titleWords(jobTitle);
  const titleText = [r.headline, r.titleLine, r.summary, ...r.experience.map((e) => e.title)].join(" ").toLowerCase();
  const titleRatio = tw.length ? tw.filter((w) => titleText.includes(w)).length / tw.length : null;
  const bullets = r.experience.flatMap((e) => e.bullets);
  const quantified = bullets.filter((b) => /\d/.test(b)).length;
  const words = wordCount(text);
  const checks: MatchCheck[] = [
    { label: "Job title appears in the headline, summary or a role", ok: (titleRatio ?? 1) >= 0.67 },
    { label: "Covers the required skills", ok: !c.missing.some((k) => k.required) },
    { label: "Has a professional summary", ok: !!r.summary?.trim() },
    { label: "Half or more of the bullets show a number or result", ok: bullets.length > 0 && quantified / bullets.length >= 0.5 },
    { label: "Contact details include email and phone", ok: !!r.contact.email && !!r.contact.phone },
    { label: "Length fits one to two pages (350–1,000 words)", ok: words >= 350 && words <= 1000 },
  ];
  const score = blend([
    [c.hardRatio, 0.65],
    [c.softRatio, 0.15],
    [titleRatio, 0.2],
  ]);
  return { score, matched: c.matched, missing: c.missing, softMatched: c.softMatched, softMissing: c.softMissing, checks };
}

export function scoreCoverLetter(letter: string, jd: string, company: string, jobTitle: string): MatchResult {
  const { hard, soft } = jobKeywords(jd);
  // A letter is not expected to list every skill: measure the ten most important ones.
  const top = hard.slice(0, 10);
  const c = coverage(letter, top, soft);
  const words = wordCount(letter);
  const lower = letter.toLowerCase();
  const companyOk = !!company && lower.includes(company.toLowerCase());
  const tw = titleWords(jobTitle);
  const titleRatio = tw.length ? tw.filter((w) => lower.includes(w)).length / tw.length : null;
  const lengthOk = words >= 200 && words <= 450;
  const checks: MatchCheck[] = [
    { label: "Names the company", ok: companyOk },
    { label: "Names the role", ok: (titleRatio ?? 1) >= 0.67 },
    { label: "Mentions the top skills from the posting", ok: (c.hardRatio ?? 1) >= 0.5 },
    { label: "Includes at least one concrete result (a number)", ok: /\d/.test(letter) },
    { label: "Length is 200–450 words", ok: lengthOk },
  ];
  const score = blend([
    [c.hardRatio, 0.5],
    [c.softRatio, 0.1],
    [company ? (companyOk ? 1 : 0) : null, 0.15],
    [titleRatio, 0.1],
    [lengthOk ? 1 : Math.max(0, 1 - Math.abs(words - 325) / 325), 0.15],
  ]);
  return { score, matched: c.matched, missing: c.missing, softMatched: c.softMatched, softMissing: c.softMissing, checks };
}
