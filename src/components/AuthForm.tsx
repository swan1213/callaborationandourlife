"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck2, Eye, EyeOff, FileText, ShieldCheck } from "lucide-react";
import { Alert, api, Spinner } from "./ui";
import ThemeToggle from "./ThemeToggle";
import { Logo, LogoMark } from "./Logo";

/** Only the email is kept here — the password is left to the browser's password manager. */
const REMEMBER_KEY = "tb_remember_email";

const FEATURES = [
  { icon: FileText, title: "Tailored in minutes", text: "Resumes, cover letters and job descriptions shaped to each posting." },
  { icon: CalendarCheck2, title: "Interviews in one place", text: "Requests, schedules and documents for every candidate profile." },
  { icon: ShieldCheck, title: "Controlled access", text: "Role-based accounts, approvals and a full activity log." },
];

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (mode !== "login") return;
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) setForm((f) => (f.email ? f : { ...f, email: saved }));
    } catch {}
  }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        const r = await api<{ message: string }>("/api/auth/register", { method: "POST", json: form });
        setSuccess(r.message);
        setForm({ name: "", email: "", password: "" });
      } else {
        const r = await api<{ role: string }>("/api/auth/login", { method: "POST", json: { ...form, remember } });
        try {
          if (remember) localStorage.setItem(REMEMBER_KEY, form.email.trim());
          else localStorage.removeItem(REMEMBER_KEY);
        } catch {}
        const next = params.get("next");
        router.replace(next && next.startsWith("/") ? next : r.role === "bidder" ? "/dashboard/import" : r.role === "caller" ? "/caller/requests" : "/admin");
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const login = mode === "login";

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Form column */}
      <div className="relative flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo size={28} />
          <ThemeToggle compact />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <div className="animate-pop-in">
            <h1 className="text-2xl font-semibold tracking-tight">{login ? "Welcome back" : "Request access"}</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {login ? "Sign in to your TailorBid workspace." : "Create an account. An administrator approves new sign-ups."}
            </p>

            <form onSubmit={submit} method="post" className="mt-8 space-y-4">
              {error && <Alert>{error}</Alert>}
              {success && <Alert kind="success">{success}</Alert>}
              {!login && (
                <div>
                  <label className="label" htmlFor="name">
                    Full name
                  </label>
                  <input
                    id="name"
                    name="name"
                    className="input"
                    required
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              )}
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  className="input"
                  type="email"
                  name="email"
                  id="email"
                  required
                  placeholder="you@company.com"
                  autoComplete={login ? "username" : "email"}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    id="password"
                    required
                    minLength={login ? undefined : 8}
                    autoComplete={login ? "current-password" : "new-password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 grid w-10 cursor-pointer place-items-center text-slate-400 transition-colors hover:text-slate-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {!login && <p className="hint">At least 8 characters.</p>}
              </div>
              {login && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 select-none">
                  <input type="checkbox" className="size-4 rounded" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Remember me
                </label>
              )}
              <button className="btn btn-primary btn-lg w-full" disabled={busy}>
                {busy ? <Spinner /> : null}
                {login ? "Sign in" : "Request access"}
                {!busy && <ArrowRight />}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              {login ? (
                <>
                  No account?{" "}
                  <Link href="/register" className="link">
                    Request access
                  </Link>
                </>
              ) : (
                <>
                  Already approved?{" "}
                  <Link href="/login" className="link">
                    Sign in
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-400">© {new Date().getFullYear()} TailorBid</p>
      </div>

      {/* Product panel (large screens) */}
      <div className="relative hidden overflow-hidden border-l border-slate-200 bg-slate-100 lg:block">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        />
        <div className="relative flex h-full flex-col justify-center px-14 py-16 xl:px-20">
          <LogoMark size={40} />
          <h2 className="mt-8 max-w-md text-3xl leading-tight font-semibold tracking-tight text-slate-900">Every application, tailored to the job.</h2>
          <p className="mt-3 max-w-md text-[15px] text-slate-500">
            TailorBid turns a job posting into a matching resume, cover letter and job summary, and keeps the interviews that follow organized.
          </p>
          <ul className="mt-10 max-w-md space-y-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="card flex gap-3.5 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-indigo-600">
                  <Icon className="size-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-slate-900">{title}</span>
                  <span className="mt-0.5 block text-[13px] text-slate-500">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
