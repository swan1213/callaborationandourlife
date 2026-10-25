// "Save to folder" (application page): writes a ZIP's files straight into a folder on this computer, keeping its paths
// ([Date]/[Profile]/[Job Title]_[Company]/…, see zipLayout.ts), so nothing has to be unzipped.
// Uses the File System Access API (Chrome and Edge on desktop). The chosen folder is remembered per browser in
// IndexedDB; the browser asks again for permission when it has expired. Client-only.

type Dir = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
};
type Picker = (o: { id?: string; mode: "readwrite"; startIn?: string }) => Promise<Dir>;

const DB = "save-to-folder";
const STORE = "handles";
const KEY = "root";

export const canSaveToFolder = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

function idb<T>(run: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

async function storedFolder(): Promise<Dir | null> {
  try {
    return (await idb((s) => s.get(KEY), "readonly")) ?? null;
  } catch {
    return null;
  }
}

/** Name of the remembered folder, or "" when none is set. */
export async function savedFolderName() {
  return (await storedFolder())?.name ?? "";
}

/** Asks for a folder and remembers it. Returns null when the person cancels. */
export async function chooseFolder(): Promise<Dir | null> {
  try {
    const dir = await (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker({ id: "applications", mode: "readwrite", startIn: "downloads" });
    await idb((s) => s.put(dir, KEY), "readwrite").catch(() => {});
    return dir;
  } catch (e) {
    if ((e as Error).name === "AbortError") return null;
    throw e;
  }
}

/** The remembered folder with write permission, else a newly chosen one (null when cancelled). Call from a click. */
async function writableFolder(): Promise<Dir | null> {
  const dir = await storedFolder();
  if (dir && ((await dir.queryPermission({ mode: "readwrite" })) === "granted" || (await dir.requestPermission({ mode: "readwrite" })) === "granted")) return dir;
  return chooseFolder();
}

/**
 * Downloads the ZIP at `url` and writes its files into the folder (existing files with the same name are replaced).
 * Returns where they went ("Applications/2026-10-25/Jane_Doe/03_…"), or null when the person cancelled the folder picker.
 */
export async function saveZipToFolder(url: string): Promise<string | null> {
  const dir = await writableFolder();
  if (!dir) return null;
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Download failed (${res.status})`);
  }
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const folders = new Set<string>();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const parts = entry.name.split("/").filter(Boolean);
    const name = parts.pop()!;
    let at: FileSystemDirectoryHandle = dir;
    for (const p of parts) at = await at.getDirectoryHandle(p, { create: true });
    const out = await (await at.getFileHandle(name, { create: true })).createWritable();
    await out.write(await entry.async("blob"));
    await out.close();
    folders.add(parts.join("/"));
  }
  return [dir.name, ...folders].slice(0, 2).join("/");
}
