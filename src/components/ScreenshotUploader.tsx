"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, Upload } from "lucide-react";
import { api, Spinner } from "./ui";

type Sign = { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string };

const MAX_BYTES = 10 * 1024 * 1024;

/** Uploads screenshots straight to Cloudinary, then attaches them to the application (the bidder then clicks Submit). */
export default function ScreenshotUploader({
  applicationId,
  onUploaded,
  compact,
  globalPaste,
}: {
  applicationId: string;
  onUploaded: () => void;
  compact?: boolean;
  /** Accept Ctrl+V screenshots anywhere on the page (not just when the drop zone is focused). */
  globalPaste?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of images) {
        if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 10 MB`);
        const sign = await api<Sign>("/api/cloudinary/sign", { method: "POST" });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("api_key", sign.apiKey);
        fd.append("timestamp", String(sign.timestamp));
        fd.append("folder", sign.folder);
        fd.append("signature", sign.signature);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Upload failed");
        await api(`/api/applications/${applicationId}`, {
          method: "PATCH",
          json: { addScreenshot: { url: data.secure_url, publicId: data.public_id } },
        });
      }
      onUploaded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  useEffect(() => {
    if (!globalPaste) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.some((f) => f.type.startsWith("image/"))) {
        e.preventDefault();
        uploadRef.current(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [globalPaste]);

  return (
    <div
      onPaste={globalPaste ? undefined : (e) => upload(Array.from(e.clipboardData.files))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        upload(Array.from(e.dataTransfer.files));
      }}
      className={
        compact
          ? ""
          : "group flex flex-col items-center rounded-lg border border-dashed border-line-strong px-4 py-5 text-center transition-colors outline-none hover:border-indigo-400 hover:bg-slate-50 focus-visible:border-indigo-500 focus-visible:bg-indigo-50"
      }
      tabIndex={compact ? undefined : 0}
    >
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(Array.from(e.target.files ?? []))} />
      {!compact && (
        <div className="mb-3 grid size-9 place-items-center rounded-lg border border-slate-200 bg-surface text-slate-500 transition-colors group-hover:text-indigo-600">
          <Upload className="size-4" aria-hidden />
        </div>
      )}
      <button type="button" className={`btn btn-secondary ${compact ? "btn-sm" : ""}`} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Spinner /> : <Upload />}
        {compact ? "Upload" : "Upload screenshot"}
      </button>
      {!compact && (
        <div className="mt-2 text-xs text-slate-500">
          Drag & drop, paste (<span className="kbd">Ctrl</span>+<span className="kbd">V</span>) or choose images · max 10 MB each
        </div>
      )}
      {error && (
        <div role="alert" className={`mt-1.5 flex min-w-0 items-start gap-1 text-left text-xs text-rose-600 ${compact ? "" : "justify-center"}`}>
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
