"use client";

// Desktop notifications (Windows / macOS), turned on per browser from the bell menu ("Desktop alerts"):
// - web push (public/sw.js, lib/push.ts): every notification, even when TailorBid is closed;
// - desktopNotify(): alerts the open page raises itself (upcoming interviews), and every notification when the
//   server has no push keys set up.
const PREF_KEY = "tb-desktop-alerts";
const PUSH_KEY = "tb-push-endpoint"; // this browser's push subscription, while it is registered with TailorBid

export const desktopSupported = () => typeof window !== "undefined" && "Notification" in window;
const pushSupported = () => desktopSupported() && "serviceWorker" in navigator && "PushManager" in window;

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

/** "on" (allowed and turned on) · "off" · "blocked" (denied in the browser) · "unsupported". */
export function desktopState(): "on" | "off" | "blocked" | "unsupported" {
  if (!desktopSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && read(PREF_KEY) !== "off" ? "on" : "off";
}

/** Notifications already arrive by web push in this browser (the page then doesn't show its own copy). */
export const pushActive = () => desktopState() === "on" && Boolean(read(PUSH_KEY));

const keyBytes = (base64url: string) => {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Registers this browser for web push with TailorBid (or keeps the existing registration). Quietly does nothing
 * when the browser or the server doesn't support it. */
export async function ensurePush() {
  if (!pushSupported() || desktopState() !== "on") return;
  try {
    const { publicKey } = await fetch("/api/push").then((r) => (r.ok ? r.json() : { publicKey: null }));
    if (!publicKey) return write(PUSH_KEY, null);
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // Subscribed with another key (the server's keys changed): start over.
    const current = sub?.options.applicationServerKey;
    if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...keyBytes(publicKey)))) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    write(PUSH_KEY, res.ok ? sub.endpoint : null);
  } catch {
    write(PUSH_KEY, null); // push unavailable here: the page shows desktop notifications itself while open
  }
}

async function stopPush() {
  const endpoint = read(PUSH_KEY);
  write(PUSH_KEY, null);
  try {
    const reg = pushSupported() ? await navigator.serviceWorker.getRegistration("/sw.js") : undefined;
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
    if (endpoint || sub)
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: endpoint ?? sub?.endpoint }) });
  } catch {
    /* already gone */
  }
}

/** Asks the browser for permission (must run from a click), remembers the choice and (un)registers web push. */
export async function setDesktopAlerts(on: boolean) {
  if (!desktopSupported()) return desktopState();
  if (on && Notification.permission !== "granted") await Notification.requestPermission();
  write(PREF_KEY, on ? "on" : "off");
  if (on) await ensurePush();
  else await stopPush();
  return desktopState();
}

/**
 * Shows a desktop notification from the open page when they are turned on. `tag` makes the same alert from
 * several tabs (or from web push) appear once; clicking it brings TailorBid forward and opens `url`.
 */
export function desktopNotify({ title, body, tag, url }: { title: string; body?: string; tag: string; url?: string }) {
  if (desktopState() !== "on") return;
  try {
    const n = new Notification(title, { body, tag, icon: "/icon.svg" });
    n.onclick = () => {
      window.focus();
      if (url) window.location.assign(url);
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
