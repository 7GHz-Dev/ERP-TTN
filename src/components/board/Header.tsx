"use client";

import { CalendarDays, ChevronLeft, ChevronRight, KeyRound, Loader2, LogOut, Plus, ShieldCheck, Users, Check } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import clsx from "clsx";
import { addDays, dayOfMonth, formatThaiDateLong, weekdayShort } from "@/lib/logic/dates";
import { button } from "@/components/ui/styles";
import { ROLE_LABEL, can, type CurrentUser } from "@/lib/auth/roles";

interface Props {
  date: string;
  today: string;
  setDate: (d: string) => void;
  dayCounts: Map<string, { total: number; unassigned: number }>;
  saving: boolean;
  user: CurrentUser;
  /** ไม่ส่ง = ไม่มีสิทธิ์นำเข้าแพลน (ซ่อนปุ่ม) */
  onImport?: () => void;
  onChangePassword: () => void;
  onDrivers: () => void;
  onSignOut: () => void;
}

export function Header({ date, today, setDate, dayCounts, saving, user, onImport, onChangePassword, onDrivers, onSignOut }: Props) {
  const dateRef = useRef<HTMLInputElement>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(date, i - 3));

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-2.5 lg:px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-blue-900 font-bold text-white" aria-hidden>
            T
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-semibold">TTN แพลนลากตู้</p>
            <p className="text-xs text-slate-500">จัดรถ · คนขับ · รถร่วม</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-slate-500 md:inline-flex" aria-live="polite">
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> กำลังบันทึก…
              </>
            ) : (
              <>
                <Check className="size-3.5 text-emerald-600" aria-hidden /> บันทึกแล้ว
              </>
            )}
          </span>
          <button type="button" onClick={onDrivers} className={button("secondary", "md", "xl:hidden")}>
            <Users className="size-4" aria-hidden />
            <span className="max-sm:sr-only">คนขับ</span>
          </button>
          {onImport && (
            <button type="button" onClick={onImport} className={button("primary", "md")}>
              <Plus className="size-4" aria-hidden />
              นำเข้าแพลน
            </button>
          )}
          <details className="relative">
            <summary
              className="grid size-10 cursor-pointer list-none place-items-center rounded-full bg-slate-100 text-sm font-semibold uppercase text-slate-700 hover:bg-slate-200 [&::-webkit-details-marker]:hidden"
              aria-label="บัญชีผู้ใช้"
            >
              {user.displayName.slice(0, 1) || "?"}
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
              <div className="px-2 py-1.5">
                <p className="truncate text-sm font-medium">{user.displayName}</p>
                <p className="truncate text-xs text-slate-500">
                  {user.username} · {user.role ? ROLE_LABEL[user.role] : "ไม่มีสิทธิ์"}
                </p>
              </div>
              {can(user.role, "users.manage") && (
                <Link href="/users" className={button("ghost", "md", "w-full justify-start")}>
                  <ShieldCheck className="size-4" aria-hidden />
                  จัดการผู้ใช้
                </Link>
              )}
              <button type="button" onClick={onChangePassword} className={button("ghost", "md", "w-full justify-start")}>
                <KeyRound className="size-4" aria-hidden />
                เปลี่ยนรหัสผ่าน
              </button>
              <button type="button" onClick={onSignOut} className={button("ghost", "md", "w-full justify-start")}>
                <LogOut className="size-4" aria-hidden />
                ออกจากระบบ
              </button>
            </div>
          </details>
        </div>
      </div>

      {/* วันที่ */}
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 pb-2.5 lg:px-6">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="วันก่อนหน้า" onClick={() => setDate(addDays(date, -1))} className={button("ghost", "md", "w-10 px-0")}>
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => dateRef.current?.showPicker?.()}
            className="relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-left hover:bg-slate-100"
          >
            <CalendarDays className="size-4 text-slate-500" aria-hidden />
            <span className="whitespace-nowrap text-base font-semibold">{formatThaiDateLong(date)}</span>
            <input
              ref={dateRef}
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="เลือกวันที่"
              className="pointer-events-none absolute inset-0 opacity-0"
              tabIndex={-1}
            />
          </button>
          <button type="button" aria-label="วันถัดไป" onClick={() => setDate(addDays(date, 1))} className={button("ghost", "md", "w-10 px-0")}>
            <ChevronRight className="size-5" aria-hidden />
          </button>
          {date !== today && (
            <button type="button" onClick={() => setDate(today)} className={button("secondary", "sm", "ml-1")}>
              วันนี้
            </button>
          )}
        </div>

        <nav aria-label="เลือกวัน" className="ml-auto hidden gap-1 lg:flex">
          {days.map((d) => {
            const c = dayCounts.get(d);
            const isSel = d === date;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                aria-current={isSel ? "date" : undefined}
                className={clsx(
                  "flex h-12 w-[4.5rem] cursor-pointer flex-col items-center justify-center rounded-lg text-xs transition-colors",
                  isSel ? "bg-slate-900 text-white" : "hover:bg-slate-100",
                )}
              >
                <span className={clsx("leading-tight", !isSel && "text-slate-500", d === today && !isSel && "font-semibold text-blue-800")}>
                  {d === today ? "วันนี้" : weekdayShort(d)} {dayOfMonth(d)}
                </span>
                <span className="mt-0.5 flex items-center gap-1 leading-tight tabular-nums">
                  {c?.total ? `${c.total} ตู้` : <span className={isSel ? "text-white/60" : "text-slate-400"}>–</span>}
                  {c && c.unassigned > 0 && (
                    <span className="rounded-full bg-amber-400 px-1 text-[10px] font-semibold text-slate-950" title={`ยังไม่จัดรถ ${c.unassigned} ตู้`}>
                      {c.unassigned}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
