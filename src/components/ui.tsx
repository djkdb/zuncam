"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-2xl border border-ink-200 bg-white", className)}>{children}</As>;
}

export function SectionTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase">
        {icon}
        {children}
      </h2>
      {right}
    </div>
  );
}

type Tone = "neutral" | "blue" | "emerald" | "amber" | "violet" | "indigo" | "red" | "orange";
const TONES: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-600",
  blue: "bg-blue-50 text-blue-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  violet: "bg-violet-50 text-violet-700",
  indigo: "bg-indigo-50 text-indigo-700",
  red: "bg-red-50 text-red-700",
  orange: "bg-orange-50 text-orange-700",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ai";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink-900 text-white hover:bg-ink-800",
  secondary: "border border-ink-200 bg-white text-ink-800 hover:bg-ink-50",
  ghost: "text-ink-600 hover:bg-ink-100",
  danger: "text-red-600 hover:bg-red-50",
  ai: "bg-indigo-600 text-white hover:bg-indigo-500",
};

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-ink-100", className)} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink-200 px-4 py-8 text-center">
      {icon && <div className="text-ink-300">{icon}</div>}
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {description && <p className="max-w-xs text-xs text-ink-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx("max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl", wide ? "sm:max-w-xl" : "sm:max-w-md")}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="text-base font-semibold">
            {title}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100" aria-label="닫기">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  "h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";
export const textareaCls =
  "w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

/** 과제 진행률 (기록 / 예상). 예상을 넘으면 주황색 */
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pctDone = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
  return (
    <div className="mt-1 h-1 w-full max-w-40 overflow-hidden rounded-full bg-ink-100" aria-label={`진행 ${pctDone}%`}>
      <div className={cx("h-full rounded-full", done > total ? "bg-orange-400" : "bg-emerald-500")} style={{ width: `${pctDone}%` }} />
    </div>
  );
}
