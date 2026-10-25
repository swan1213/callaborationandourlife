"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search, Smile } from "lucide-react";

/** Each entry: the emoji, then words to find it by. */
type Group = { name: string; icon: string; emojis: [string, string][] };

const GROUPS: Group[] = [
  {
    name: "Smileys",
    icon: "😀",
    emojis: [
      ["😀", "grin smile happy"], ["😃", "smile happy joy"], ["😄", "smile laugh happy"], ["😁", "grin beam"], ["😆", "laugh lol"],
      ["😅", "sweat relief nervous"], ["🤣", "rofl laugh lol"], ["😂", "joy tears laugh lol"], ["🙂", "slight smile"], ["🙃", "upside down silly"],
      ["😉", "wink"], ["😊", "blush smile"], ["😇", "angel innocent"], ["🥰", "love hearts adore"], ["😍", "heart eyes love"],
      ["🤩", "star struck wow"], ["😘", "kiss"], ["😋", "yum tasty"], ["😛", "tongue"], ["😜", "wink tongue crazy"],
      ["🤪", "zany crazy"], ["🤑", "money rich"], ["🤗", "hug"], ["🤭", "oops giggle"], ["🤫", "shh quiet secret"],
      ["🤔", "think hmm"], ["🤐", "zip quiet"], ["🤨", "raised eyebrow doubt"], ["😐", "neutral meh"], ["😑", "expressionless"],
      ["😶", "speechless"], ["😏", "smirk"], ["😒", "unamused"], ["🙄", "eye roll"], ["😬", "grimace awkward"],
      ["😌", "relieved calm"], ["😔", "pensive sad"], ["😪", "sleepy"], ["😴", "sleep zzz tired"], ["😷", "mask sick"],
      ["🤒", "sick fever"], ["🤯", "mind blown shocked"], ["🥳", "party celebrate"], ["😎", "cool sunglasses"], ["🤓", "nerd geek"],
      ["🧐", "monocle inspect"], ["😕", "confused"], ["😟", "worried"], ["🙁", "frown sad"], ["😮", "open mouth wow"],
      ["😲", "astonished shocked"], ["🥺", "pleading please"], ["😢", "cry sad tear"], ["😭", "sob crying"], ["😱", "scream fear"],
      ["😖", "confounded"], ["😩", "weary tired"], ["😫", "tired exhausted"], ["🥱", "yawn bored"], ["😤", "triumph huff"],
      ["😡", "angry mad rage"], ["😠", "angry mad"], ["🤬", "cursing swear"], ["💀", "skull dead lol"], ["🤡", "clown"],
      ["👻", "ghost"], ["🤖", "robot bot"], ["💩", "poop"],
    ],
  },
  {
    name: "People",
    icon: "👍",
    emojis: [
      ["👍", "thumbs up yes ok like"], ["👎", "thumbs down no dislike"], ["👌", "ok perfect"], ["✌️", "peace victory"], ["🤞", "fingers crossed luck"],
      ["🤟", "love you"], ["🤘", "rock on"], ["🤙", "call me shaka"], ["👈", "point left"], ["👉", "point right"],
      ["👆", "point up"], ["👇", "point down"], ["☝️", "index up"], ["👋", "wave hi hello bye"], ["🤚", "raised hand"],
      ["✋", "hand stop high five"], ["🖐️", "hand fingers"], ["🖖", "vulcan"], ["👏", "clap applause bravo"], ["🙌", "raise hands hooray"],
      ["👐", "open hands"], ["🤲", "palms up"], ["🤝", "handshake deal agree"], ["🙏", "pray please thanks"], ["✍️", "write"],
      ["💪", "strong muscle flex"], ["🧠", "brain smart"], ["👀", "eyes look see"], ["👁️", "eye"], ["🫡", "salute"],
      ["🤷", "shrug dunno"], ["🤦", "facepalm"], ["🙋", "raise hand me"], ["🙅", "no gesture"], ["🙆", "ok gesture"],
      ["💁", "info tipping"], ["🧑‍💻", "developer coder laptop"], ["👨‍💼", "office worker business"], ["👩‍💼", "office worker business"], ["🕺", "dance"],
      ["💃", "dance"], ["🏃", "run hurry"], ["🚶", "walk"], ["🧘", "yoga calm"],
    ],
  },
  {
    name: "Hearts",
    icon: "❤️",
    emojis: [
      ["❤️", "heart love red"], ["🧡", "orange heart"], ["💛", "yellow heart"], ["💚", "green heart"], ["💙", "blue heart"],
      ["💜", "purple heart"], ["🖤", "black heart"], ["🤍", "white heart"], ["🤎", "brown heart"], ["💔", "broken heart"],
      ["❣️", "heart exclamation"], ["💕", "two hearts"], ["💞", "revolving hearts"], ["💓", "beating heart"], ["💗", "growing heart"],
      ["💖", "sparkling heart"], ["💘", "cupid arrow"], ["💝", "heart gift"], ["💯", "hundred perfect"], ["💢", "anger"],
      ["💥", "boom collision"], ["💫", "dizzy"], ["💦", "sweat drops"], ["💨", "dash fast"], ["💬", "speech chat"],
      ["💭", "thought"], ["💤", "zzz sleep"],
    ],
  },
  {
    name: "Nature",
    icon: "🐶",
    emojis: [
      ["🐶", "dog puppy"], ["🐱", "cat kitten"], ["🐭", "mouse"], ["🐰", "rabbit bunny"], ["🦊", "fox"],
      ["🐻", "bear"], ["🐼", "panda"], ["🐨", "koala"], ["🐯", "tiger"], ["🦁", "lion"],
      ["🐮", "cow"], ["🐷", "pig"], ["🐸", "frog"], ["🐵", "monkey"], ["🙈", "see no evil monkey"],
      ["🙉", "hear no evil"], ["🙊", "speak no evil"], ["🐔", "chicken"], ["🐧", "penguin"], ["🐦", "bird"],
      ["🦄", "unicorn"], ["🐝", "bee"], ["🦋", "butterfly"], ["🐢", "turtle slow"], ["🐍", "snake"],
      ["🐙", "octopus"], ["🐬", "dolphin"], ["🐳", "whale"], ["🌸", "blossom flower"], ["🌹", "rose"],
      ["🌻", "sunflower"], ["🌷", "tulip"], ["🌱", "seedling grow"], ["🌲", "tree"], ["🍀", "clover luck"],
      ["🍁", "maple leaf"], ["🌍", "earth world globe"], ["🌙", "moon night"], ["⭐", "star"], ["🌟", "glowing star"],
      ["✨", "sparkles"], ["⚡", "lightning zap"], ["🔥", "fire hot lit"], ["🌈", "rainbow"], ["☀️", "sun sunny"],
      ["⛅", "cloud sun"], ["🌧️", "rain"], ["❄️", "snow cold"], ["☃️", "snowman"], ["🌊", "wave ocean"],
    ],
  },
  {
    name: "Food",
    icon: "🍕",
    emojis: [
      ["🍎", "apple"], ["🍊", "orange"], ["🍋", "lemon"], ["🍌", "banana"], ["🍉", "watermelon"],
      ["🍇", "grapes"], ["🍓", "strawberry"], ["🍒", "cherries"], ["🍑", "peach"], ["🥑", "avocado"],
      ["🌶️", "pepper hot"], ["🌽", "corn"], ["🥕", "carrot"], ["🍞", "bread"], ["🧀", "cheese"],
      ["🍳", "egg cooking"], ["🥓", "bacon"], ["🍔", "burger"], ["🍟", "fries"], ["🍕", "pizza"],
      ["🌭", "hot dog"], ["🌮", "taco"], ["🌯", "burrito"], ["🍜", "noodles ramen"], ["🍣", "sushi"],
      ["🍦", "ice cream"], ["🍩", "donut"], ["🍪", "cookie"], ["🎂", "birthday cake"], ["🍰", "cake"],
      ["🍫", "chocolate"], ["🍿", "popcorn"], ["☕", "coffee tea"], ["🍵", "tea"], ["🥤", "drink soda"],
      ["🍺", "beer"], ["🍻", "cheers beers"], ["🥂", "cheers champagne"], ["🍷", "wine"], ["🍾", "champagne celebrate"],
    ],
  },
  {
    name: "Activity",
    icon: "🎉",
    emojis: [
      ["🎉", "party tada celebrate congrats"], ["🎊", "confetti"], ["🎈", "balloon"], ["🎁", "gift present"], ["🏆", "trophy win"],
      ["🥇", "gold first medal"], ["🥈", "silver second"], ["🥉", "bronze third"], ["🏅", "medal"], ["🎯", "target goal bullseye"],
      ["⚽", "soccer football"], ["🏀", "basketball"], ["🏈", "football"], ["⚾", "baseball"], ["🎾", "tennis"],
      ["🏐", "volleyball"], ["🎮", "game controller"], ["🎲", "dice"], ["🧩", "puzzle"], ["♟️", "chess"],
      ["🎨", "art paint"], ["🎵", "music note"], ["🎶", "music notes"], ["🎤", "mic sing"], ["🎧", "headphones"],
      ["🎬", "movie film"], ["📸", "camera photo"],
    ],
  },
  {
    name: "Travel",
    icon: "🚀",
    emojis: [
      ["🚀", "rocket launch ship"], ["✈️", "plane flight"], ["🚗", "car"], ["🚕", "taxi"], ["🚌", "bus"],
      ["🚲", "bike"], ["🚢", "ship"], ["🚦", "traffic light"], ["🏠", "home house"], ["🏢", "office building"],
      ["🏖️", "beach vacation"], ["🏔️", "mountain"], ["🗽", "statue liberty new york"], ["🗺️", "map"], ["🧭", "compass"],
      ["⏰", "alarm clock"], ["⌛", "hourglass time"], ["⏳", "hourglass waiting"], ["📅", "calendar date"], ["🌅", "sunrise morning"],
    ],
  },
  {
    name: "Objects",
    icon: "💡",
    emojis: [
      ["💡", "idea bulb"], ["💻", "laptop computer"], ["🖥️", "desktop computer"], ["⌨️", "keyboard"], ["🖱️", "mouse"],
      ["📱", "phone mobile"], ["☎️", "telephone call"], ["📞", "phone call"], ["📧", "email"], ["✉️", "envelope mail"],
      ["📨", "incoming mail"], ["📝", "memo note write"], ["📄", "document page resume"], ["📋", "clipboard"], ["📁", "folder"],
      ["📌", "pin"], ["📎", "paperclip attach"], ["✏️", "pencil"], ["🔍", "search find"], ["🔒", "lock secure"],
      ["🔑", "key"], ["🔔", "bell notification"], ["📣", "announce megaphone"], ["📈", "chart up growth"], ["📉", "chart down"],
      ["📊", "bar chart stats"], ["💰", "money bag"], ["💵", "dollar cash"], ["💳", "card payment"], ["💼", "briefcase job work"],
      ["🛠️", "tools fix"], ["⚙️", "gear settings"], ["🧪", "test lab"], ["📦", "package box ship"], ["🗑️", "trash delete"],
    ],
  },
  {
    name: "Symbols",
    icon: "✅",
    emojis: [
      ["✅", "check done yes"], ["☑️", "checkbox"], ["✔️", "check mark"], ["❌", "x no wrong cross"], ["❎", "cross mark"],
      ["❗", "exclamation important"], ["❓", "question"], ["⁉️", "exclamation question"], ["⚠️", "warning"], ["🚫", "no prohibited"],
      ["⛔", "no entry stop"], ["🆗", "ok"], ["🆕", "new"], ["🆒", "cool"], ["🆘", "sos help"],
      ["🔴", "red circle"], ["🟠", "orange circle"], ["🟡", "yellow circle"], ["🟢", "green circle"], ["🔵", "blue circle"],
      ["⬆️", "up arrow"], ["⬇️", "down arrow"], ["➡️", "right arrow"], ["⬅️", "left arrow"], ["🔄", "repeat refresh"],
      ["➕", "plus add"], ["➖", "minus"], ["♻️", "recycle"], ["©️", "copyright"], ["™️", "trademark"],
    ],
  },
];

const RECENT_KEY = "chat-recent-emojis";
const RECENT_MAX = 24;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

const PANEL_W = 312;
const PANEL_GAP = 8;

type Place = { left: number; width: number; top?: number; bottom?: number };

/**
 * A button that opens an emoji panel; `onPick` gets each emoji clicked. The panel is portaled to <body> and placed
 * above the button (below when there is more room there), so scrolling lists don't clip it. `quick` adds a row of
 * one-click emoji on top (reactions); `closeOnPick` closes the panel after a pick.
 */
export function EmojiPicker({
  onPick,
  disabled,
  quick,
  closeOnPick,
  label = "Emoji",
  icon = <Smile />,
  buttonClassName = "btn btn-ghost btn-icon h-10 shrink-0",
}: {
  onPick: (emoji: string) => void;
  disabled?: boolean;
  quick?: string[];
  closeOnPick?: boolean;
  label?: string;
  icon?: ReactNode;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const sections = useRef<Record<string, HTMLDivElement | null>>({});

  const reposition = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(PANEL_W, window.innerWidth - 2 * PANEL_GAP);
    const left = Math.min(Math.max(PANEL_GAP, r.right - width), window.innerWidth - width - PANEL_GAP);
    const below = window.innerHeight - r.bottom;
    setPlace(r.top >= 380 || r.top >= below ? { left, width, bottom: window.innerHeight - r.top + PANEL_GAP } : { left, width, top: r.bottom + PANEL_GAP });
  }, []);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    reposition();
    // The panel is portaled to <body>, so clicks inside it are not inside the button.
    const onDown = (e: MouseEvent) => !button.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Scrolls inside the panel itself don't move the button.
    const onScroll = (e: Event) => !panel.current?.contains(e.target as Node) && reposition();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, reposition]);
  useEffect(() => {
    if (!open) {
      setQ("");
      setPlace(null);
    }
  }, [open]);

  const found = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    return GROUPS.flatMap((g) => g.emojis).filter(([, keys]) => words.every((w) => keys.includes(w)));
  }, [q]);

  function pick(emoji: string) {
    onPick(emoji);
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
    if (closeOnPick) setOpen(false);
  }

  const grid = (list: string[]) => (
    <div className="grid grid-cols-8 gap-0.5">
      {list.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => pick(e)}
          className="flex aspect-square items-center justify-center rounded-md text-[22px] leading-none hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
          // Keep the caret in the message box.
          onMouseDown={(ev) => ev.preventDefault()}
        >
          {e}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        className={buttonClassName}
        onClick={() => setOpen((o) => !o)}
        onMouseDown={(e) => e.preventDefault()}
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        title={label}
      >
        {icon}
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={panel}
            className="popover fixed z-[60] flex animate-pop-in flex-col overflow-hidden"
            style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom }}
            role="dialog"
            aria-label={label}
          >
            {quick && (
              <div className="flex shrink-0 justify-between border-b border-slate-200 px-2 py-1.5">
                {quick.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => pick(e)}
                    className="flex size-9 items-center justify-center rounded-full text-[22px] leading-none transition-transform hover:scale-115 hover:bg-slate-100"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            <div className="relative shrink-0 border-b border-slate-200 p-2">
              <Search className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className="input h-8 pl-8" placeholder="Search emoji" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!quick} />
            </div>
            <div className="h-56 overflow-y-auto p-2">
              {found ? (
                found.length ? grid(found.map(([e]) => e)) : <p className="py-8 text-center text-xs text-slate-400">No emoji found.</p>
              ) : (
                <>
                  {recent.length > 0 && (
                    <div className="mb-2">
                      <p className="px-1 pb-1 text-[11px] font-medium text-slate-400">Recently used</p>
                      {grid(recent)}
                    </div>
                  )}
                  {GROUPS.map((g) => (
                    <div key={g.name} ref={(el) => void (sections.current[g.name] = el)} className="mb-2">
                      <p className="px-1 pb-1 text-[11px] font-medium text-slate-400">{g.name}</p>
                      {grid(g.emojis.map(([e]) => e))}
                    </div>
                  ))}
                </>
              )}
            </div>
            {!found && (
              <div className="flex shrink-0 justify-between border-t border-slate-200 px-1.5 py-1">
                {GROUPS.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    className="flex size-7 items-center justify-center rounded-md text-base hover:bg-slate-100"
                    onClick={() => sections.current[g.name]?.scrollIntoView({ block: "start" })}
                    aria-label={g.name}
                    title={g.name}
                  >
                    {g.icon}
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
