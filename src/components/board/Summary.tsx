"use client";

import { AlertTriangle, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { Driver, Job } from "@/lib/types";
import { jobStatus, returnAlert } from "@/lib/logic/status";
import { computeMoney, formatBaht } from "@/lib/logic/pricing";
import { formatThaiDate } from "@/lib/logic/dates";

export function Summary({ dayJobs, driversById }: { dayJobs: Job[]; driversById: Map<string, Driver> }) {
  const live = dayJobs.filter((j) => !j.cancelled);
  const total = live.length;
  const unassigned = live.filter((j) => jobStatus(j) === "unassigned").length;
  const typed = live.filter((j) => j.driver_name);
  const company = typed.filter((j) => driversById.get(j.driver_id ?? "")?.truck_type === "company").length;
  const partner = typed.length - company;
  const running = live.filter((j) => jobStatus(j) === "running").length;
  const done = live.filter((j) => jobStatus(j) === "done").length;
  const cost = live.reduce((s, j) => s + computeMoney(j, driversById.get(j.driver_id ?? "")?.truck_type ?? null).gross, 0);
  const pct = total ? Math.round(((total - unassigned) / total) * 100) : 0;

  return (
    <section aria-label="สรุปวันนี้" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-sm text-slate-500">จัดรถแล้ว</p>
          <p className="text-3xl font-semibold tabular-nums leading-tight">
            {total - unassigned}
            <span className="text-lg font-normal text-slate-400"> / {total} ตู้</span>
          </p>
        </div>
        <dl className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:flex-1 sm:grid-cols-6 sm:gap-3 lg:max-w-3xl">
          <Stat label="รอจัดรถ" value={unassigned} tone={unassigned ? "amber" : undefined} />
          <Stat label="รถบริษัท" value={company} />
          <Stat label="รถร่วม" value={partner} />
          <Stat label="กำลังวิ่ง" value={running} />
          <Stat label="ปิดงาน" value={done} />
          <Stat label="ค่าขนส่งรวม" value={cost ? `฿${formatBaht(cost)}` : "–"} />
        </dl>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="ความคืบหน้าการจัดรถ"
      >
        <div className={clsx("h-full rounded-full transition-[width]", unassigned ? "bg-amber-500" : "bg-emerald-600")} style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "amber" }) {
  return (
    <div className={clsx("rounded-lg px-3 py-2", tone === "amber" ? "bg-amber-50 ring-1 ring-amber-200" : "bg-slate-50")}>
      <dt className={clsx("text-xs", tone === "amber" ? "text-amber-800" : "text-slate-500")}>{label}</dt>
      <dd className={clsx("text-lg font-semibold tabular-nums leading-tight", tone === "amber" && "text-amber-900")}>{value}</dd>
    </div>
  );
}

export function ReturnAlerts({ jobs, today, onJump }: { jobs: Job[]; today: string; onJump: (j: Job) => void }) {
  const items = jobs
    .map((j) => ({ j, a: returnAlert(j, today) }))
    .filter((x): x is { j: Job; a: NonNullable<ReturnType<typeof returnAlert>> } => !!x.a && x.a.level !== "returned-late")
    .sort((x, y) => (x.j.return_due_date ?? "").localeCompare(y.j.return_due_date ?? ""));
  if (!items.length) return null;
  const overdue = items.filter((x) => x.a.level === "overdue").length;
  const soon = items.length - overdue;

  return (
    <details className="group rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <AlertTriangle className={clsx("size-5 shrink-0", overdue ? "text-rose-600" : "text-amber-600")} aria-hidden />
        <span className="flex-1">
          <span className="font-medium">ตู้ที่ต้องคืน</span>
          {overdue > 0 && <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-800">เกินกำหนด {overdue}</span>}
          {soon > 0 && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">ครบกำหนดภายในพรุ่งนี้ {soon}</span>}
        </span>
        <ChevronDown className="size-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto border-t border-slate-200">
        {items.map(({ j, a }) => (
          <li key={j.id}>
            <button type="button" onClick={() => onJump(j)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50">
              <span className="w-32 shrink-0 font-mono text-[13px] font-semibold">{j.container_no}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600">
                {j.driver_name || "ยังไม่มีคนขับ"} · แพลน {formatThaiDate(j.plan_date)}
              </span>
              <span className={clsx("shrink-0 text-xs font-medium", a.level === "overdue" ? "text-rose-700" : "text-amber-700")}>
                {a.level === "overdue" ? `เกิน ${a.days} วัน` : a.days === 0 ? "ครบวันนี้" : "ครบพรุ่งนี้"} ({formatThaiDate(j.return_due_date)})
              </span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
