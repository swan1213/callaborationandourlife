"use client";

// App-wide feedback for actions: toasts (useToast) for "Saved", "Deleted", errors and arriving notifications,
// and a confirmation dialog (useConfirm) instead of the browser's confirm().
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Modal, Spinner, type IconType } from "./ui";

export type Tone = "success" | "error" | "warning" | "info";
export type ToastInput = {
  title: string;
  description?: ReactNode;
  tone?: Tone;
  /** Replaces the tone's icon (e.g. the type of a notification). */
  icon?: IconType;
  action?: { label: string; onClick: () => void };
  /** Milliseconds on screen; errors stay longer. 0 = until closed. */
  duration?: number;
};
type Toast = ToastInput & { id: number; tone: Tone };

const TONE: Record<Tone, { icon: IconType; chip: string; bar: string }> = {
  success: { icon: CheckCircle2, chip: "border-emerald-200 bg-emerald-50 text-emerald-600", bar: "bg-emerald-500" },
  error: { icon: XCircle, chip: "border-rose-200 bg-rose-50 text-rose-600", bar: "bg-rose-500" },
  warning: { icon: AlertTriangle, chip: "border-amber-200 bg-amber-50 text-amber-600", bar: "bg-amber-500" },
  info: { icon: Info, chip: "border-indigo-200 bg-indigo-50 text-indigo-600", bar: "bg-indigo-500" },
};
const MAX_TOASTS = 4;

type ToastApi = ((t: ToastInput) => void) & {
  success: (title: string, description?: ReactNode) => void;
  error: (title: string, description?: ReactNode) => void;
  warning: (title: string, description?: ReactNode) => void;
  info: (title: string, description?: ReactNode) => void;
};
export type ConfirmInput = { title: string; message?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean };

const noop = Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }) as ToastApi;
const ToastContext = createContext<ToastApi>(noop);
const ConfirmContext = createContext<(c: ConfirmInput) => Promise<boolean>>(async () => false);

/** `toast.success("Saved")`, `toast.error(message)`, or `toast({ title, description, tone, action })`. */
export const useToast = () => useContext(ToastContext);
/** `if (!(await confirm({ title: "Delete Acme?", danger: true }))) return;` */
export const useConfirm = () => useContext(ConfirmContext);

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<(ConfirmInput & { resolve: (ok: boolean) => void }) | null>(null);
  const seq = useRef(0);
  // The toast area is portaled to <body>, which only exists in the browser. Rendering it from the first render
  // made the server's HTML differ from the browser's: React then re-rendered the whole page (hydration error),
  // which also reset <html> and its theme class.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const show = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setToasts((ts) => [...ts, { ...t, id, tone: t.tone ?? "info" }].slice(-MAX_TOASTS));
  }, []);
  const [api] = useState<ToastApi>(() =>
    Object.assign((t: ToastInput) => show(t), {
      success: (title: string, description?: ReactNode) => show({ title, description, tone: "success" }),
      error: (title: string, description?: ReactNode) => show({ title, description, tone: "error" }),
      warning: (title: string, description?: ReactNode) => show({ title, description, tone: "warning" }),
      info: (title: string, description?: ReactNode) => show({ title, description, tone: "info" }),
    })
  );
  const confirm = useCallback((c: ConfirmInput) => new Promise<boolean>((resolve) => setAsk({ ...c, resolve })), []);

  return (
    <ToastContext.Provider value={api}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        {ask && (
          <ConfirmDialog
            {...ask}
            onDone={(ok) => {
              ask.resolve(ok);
              setAsk(null);
            }}
          />
        )}
        {mounted &&
          createPortal(
            <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
              {toasts.map((t) => (
                <ToastCard key={t.id} t={t} onClose={() => dismiss(t.id)} />
              ))}
            </div>,
            document.body
          )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

function ToastCard({ t, onClose }: { t: Toast; onClose: () => void }) {
  const style = TONE[t.tone];
  const Icon = t.icon ?? style.icon;
  const duration = t.duration ?? (t.tone === "error" ? 9000 : 5000);
  const [paused, setPaused] = useState(false);
  const left = useRef(duration);
  useEffect(() => {
    if (!duration || paused) return;
    const started = Date.now();
    const timer = setTimeout(onClose, left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [duration, paused, onClose]);

  return (
    <div
      role={t.tone === "error" ? "alert" : "status"}
      className="popover pointer-events-auto relative animate-pop-in overflow-hidden p-3.5 pr-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-start gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${style.chip}`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-sm font-medium text-slate-900">{t.title}</div>
          {t.description && <div className="mt-0.5 line-clamp-3 text-[13px] text-slate-500">{t.description}</div>}
          {t.action && (
            <button
              className="btn btn-secondary btn-sm mt-2.5"
              onClick={() => {
                t.action!.onClick();
                onClose();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      </div>
      <button className="btn btn-ghost btn-sm btn-icon absolute top-2 right-2" onClick={onClose} aria-label="Dismiss">
        <X />
      </button>
      {!!duration && (
        <span
          aria-hidden
          className={`absolute bottom-0 left-0 h-0.5 ${style.bar} opacity-60`}
          style={{ animation: `toast-progress ${duration}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }}
        />
      )}
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, onDone }: ConfirmInput & { onDone: (ok: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const Icon = danger ? AlertTriangle : Info;
  return (
    <Modal open onClose={() => onDone(false)} title={title}>
      <div className="flex gap-3.5">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${danger ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}`}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1 pt-1.5 text-sm text-slate-600">{message ?? "Are you sure?"}</div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn btn-secondary" onClick={() => onDone(false)} autoFocus>
          {cancelLabel}
        </button>
        <button
          className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onDone(true);
          }}
        >
          {busy && <Spinner className="h-3.5 w-3.5" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
