// "On top": moves the whole app into a Document Picture-in-Picture window, which stays above other
// windows (the meeting) like the old desktop app did. Supported by Chrome and Edge 116+.
// The app keeps running in this tab; only its DOM moves, so nothing is reloaded or lost.

export const onTopSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

// Starting sizes per layout (Full / Medium / Mini), as in the desktop version.
const SIZES = { full: [960, 720], medium: [820, 600], mini: [560, 280] };

let pip = null;

const copyAttributes = (from, to) => {
  for (const { name } of [...to.attributes]) if (!from.hasAttribute(name)) to.removeAttribute(name);
  for (const { name, value } of [...from.attributes]) to.setAttribute(name, value);
};

// Must be called from a click (the browser requires a user gesture). onClose runs when the window closes.
export async function openOnTop(viewMode, onClose) {
  if (pip) return;
  const [width, height] = SIZES[viewMode] || SIZES.full;
  const win = await window.documentPictureInPicture.requestWindow({ width, height });
  pip = win;
  win.document.title = document.title;

  // Same styles: copy the rules (dev server <style> tags) or link the built stylesheet.
  for (const sheet of document.styleSheets) {
    try {
      const style = win.document.createElement('style');
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      win.document.head.append(style);
    } catch {
      const link = win.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      win.document.head.append(link);
    }
  }

  // Theme and accent live on <html>: keep them in sync while the window is open.
  copyAttributes(document.documentElement, win.document.documentElement);
  const observer = new MutationObserver(() => copyAttributes(document.documentElement, win.document.documentElement));
  observer.observe(document.documentElement, { attributes: true });

  // Hotkeys and Escape-to-close dialogs listen on the main window.
  const forwardKey = (e) => {
    const copy = new KeyboardEvent('keydown', e);
    window.dispatchEvent(copy);
    if (copy.defaultPrevented) e.preventDefault();
  };
  win.addEventListener('keydown', forwardKey);

  const root = document.getElementById('root');
  win.document.body.append(root);

  win.addEventListener('pagehide', () => {
    observer.disconnect();
    document.body.append(root);
    pip = null;
    onClose?.();
  });
}

export function closeOnTop() {
  pip?.close();
}

// Resizes the on-top window when switching layouts (needs a click inside it, which the switch is).
export function resizeOnTop(viewMode) {
  const [width, height] = SIZES[viewMode] || SIZES.full;
  try {
    pip?.resizeTo(width, height);
  } catch {
    // Not allowed without a user gesture (e.g. the hotkey): keep the current size.
  }
}

// document.getElementById that also looks inside the on-top window.
export const findById = (id) => document.getElementById(id) || pip?.document.getElementById(id) || null;
