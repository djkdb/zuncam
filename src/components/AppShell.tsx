"use client";

import { CalendarClock, CalendarRange, Clock3, ListChecks, Plus, Settings2, Sunrise, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { actions, clockActions, useCampusStore, useClock } from "@/lib/store";
import { formatKoreanDate, fromMinutes } from "@/lib/time";
import { QuickAdd } from "./QuickAdd";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Today", icon: Sunrise },
  { href: "/timetable", label: "시간표", icon: CalendarRange },
  { href: "/assignments", label: "과제", icon: ListChecks },
  { href: "/events", label: "일정", icon: CalendarClock },
  { href: "/settings", label: "설정", icon: Settings2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [quickOpen, setQuickOpen] = useState(false);
  const { clock, overridden } = useClock();
  const { notice } = useCampusStore();

  return (
    <div className="min-h-dvh lg:flex">
      {/* 데스크톱 사이드바 */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-ink-200 bg-white px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid size-7 place-items-center rounded-lg bg-ink-900 text-[11px] font-bold text-white">OS</span>
          <span className="text-[15px] font-semibold tracking-tight">Campus OS</span>
        </Link>
        <nav className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cx("flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm", pathname === href ? "bg-ink-100 font-semibold text-ink-900" : "text-ink-500 hover:bg-ink-50")}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <button type="button" onClick={() => setQuickOpen(true)} className="mt-6 flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-500">
          <Plus className="size-4" /> 자연어로 추가
        </button>
        <p className="mt-auto px-2 text-[11px] leading-relaxed text-ink-400">시간표·과제·일정을 하나의 컨텍스트로 통합해 &lsquo;지금 할 일&rsquo;을 제안합니다.</p>
      </aside>

      <div className="min-w-0 flex-1">
        {/* 모바일 상단바 */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md bg-ink-900 text-[10px] font-bold text-white">OS</span>
            <span className="text-sm font-semibold">Campus OS</span>
          </Link>
          <button type="button" onClick={() => setQuickOpen(true)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white">
            <Plus className="size-3.5" /> 추가
          </button>
        </header>

        {overridden && (
          <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-xs text-amber-900">
            <Clock3 className="size-3.5" />
            데모 시간: {formatKoreanDate(clock.date)} {fromMinutes(clock.minutes)}
            <button type="button" className="ml-1 inline-flex items-center gap-0.5 font-semibold underline" onClick={() => clockActions.setOverride(null)}>
              <X className="size-3" /> 실제 시간으로
            </button>
          </div>
        )}
        {notice && (
          <div className="flex items-center justify-center gap-2 bg-red-50 px-4 py-1.5 text-xs text-red-700">
            {notice}
            <button type="button" className="font-semibold underline" onClick={() => actions.dismissNotice()}>
              확인
            </button>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>

      {/* 모바일 하단 탭 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[10px]", pathname === href ? "font-semibold text-ink-900" : "text-ink-400")}>
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>

      <QuickAdd open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}
