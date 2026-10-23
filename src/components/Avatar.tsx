/** Preset avatars: an emoji on a gradient. Stored on the user as "preset:<id>"; uploaded photos are stored as their URL. */
export const AVATAR_PRESETS: { id: string; emoji: string; from: string; to: string }[] = [
  { id: "fox", emoji: "🦊", from: "#fb923c", to: "#ea580c" },
  { id: "panda", emoji: "🐼", from: "#94a3b8", to: "#475569" },
  { id: "koala", emoji: "🐨", from: "#a5b4fc", to: "#6366f1" },
  { id: "lion", emoji: "🦁", from: "#fcd34d", to: "#d97706" },
  { id: "tiger", emoji: "🐯", from: "#fdba74", to: "#c2410c" },
  { id: "frog", emoji: "🐸", from: "#86efac", to: "#16a34a" },
  { id: "octopus", emoji: "🐙", from: "#f9a8d4", to: "#db2777" },
  { id: "owl", emoji: "🦉", from: "#d6d3d1", to: "#78716c" },
  { id: "penguin", emoji: "🐧", from: "#7dd3fc", to: "#0369a1" },
  { id: "dolphin", emoji: "🐬", from: "#67e8f9", to: "#0891b2" },
  { id: "unicorn", emoji: "🦄", from: "#e9d5ff", to: "#a855f7" },
  { id: "bee", emoji: "🐝", from: "#fde047", to: "#ca8a04" },
  { id: "sunflower", emoji: "🌻", from: "#fef08a", to: "#65a30d" },
  { id: "rocket", emoji: "🚀", from: "#c7d2fe", to: "#4338ca" },
  { id: "star", emoji: "⭐", from: "#fde68a", to: "#f59e0b" },
  { id: "headphones", emoji: "🎧", from: "#99f6e4", to: "#0f766e" },
  { id: "coffee", emoji: "☕", from: "#d6b89c", to: "#7c4a2d" },
  { id: "cat", emoji: "🐱", from: "#fecaca", to: "#dc2626" },
];

const INITIAL_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444"];

export function Avatar({ avatar, name, size = 36, className = "" }: { avatar?: string | null; name: string; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: size * 0.5 };
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full select-none ${className}`;
  if (avatar?.startsWith("preset:")) {
    const p = AVATAR_PRESETS.find((x) => `preset:${x.id}` === avatar);
    if (p)
      return (
        <span className={base} style={{ ...style, background: `linear-gradient(135deg, ${p.from}, ${p.to})` }} role="img" aria-label={`${name}'s avatar`}>
          <span style={{ lineHeight: 1 }}>{p.emoji}</span>
        </span>
      );
  }
  if (avatar?.startsWith("https://"))
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatar.replace("/upload/", `/upload/c_fill,g_face,w_${size * 2},h_${size * 2}/`)} alt={`${name}'s avatar`} className={`${base} object-cover`} style={style} />
    );
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className={`${base} font-semibold text-white`} style={{ ...style, fontSize: size * 0.4, background: INITIAL_COLORS[h % INITIAL_COLORS.length] }} aria-label={name}>
      {initials || "?"}
    </span>
  );
}
