"use client";

import { Banknote } from "lucide-react";
import { findSalary } from "@/lib/salary";

/** The pay the job description states, highlighted above it; nothing when it states none. */
export function SalaryBanner({ jobDescription, className = "" }: { jobDescription: string; className?: string }) {
  const salary = findSalary(jobDescription);
  if (!salary) return null;
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 ${className}`}>
      <Banknote className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
      <div className="min-w-0 text-sm">
        <span className="font-semibold text-amber-800">Salary: </span>
        <span className="font-semibold text-slate-900 tabular-nums">{salary}</span>
      </div>
    </div>
  );
}
