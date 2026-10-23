// Shared bits of the Interview History pages (recordings from the Interview Assistant).

export const STAGE_LABEL: Record<string, string> = {
  recruiter: "Recruiter call",
  hr: "HR / behavioral",
  technical: "Technical call",
  takehome: "Take-home review",
  final: "Final / hiring manager",
  onboarding: "Onboarding call",
};

export type SessionSummary = {
  _id: string;
  clientId: string;
  user: string;
  userName: string;
  interview?: string | null;
  profileLabel: string;
  company: string;
  role: string;
  stage: string;
  startedAt: string;
  endedAt?: string | null;
  questionCount: number;
  captionCount: number;
  summary: string;
};

export type SessionReport = {
  summary: string;
  wentWell: string[];
  toImprove: { question: string; tip: string }[];
  thankYouEmail: string;
  nextStagePrep: string[];
  generatedAt?: number;
};

export type SessionDetail = Omit<SessionSummary, "questionCount" | "captionCount" | "summary"> & {
  captions: { t: number; text: string; translation?: string }[];
  answers: { t: number; question: string; source: string; answer: string; keyPoints: string; meaning: string; mood: string }[];
  report: SessionReport | null;
};

export const sessionTitle = (s: { company: string; role: string }) => [s.company || "Interview", s.role].filter(Boolean).join(" · ");

export function duration(s: { startedAt: string; endedAt?: string | null }) {
  if (!s.endedAt) return "";
  const min = Math.max(1, Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** "12:05" from the start of the interview. */
export function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
