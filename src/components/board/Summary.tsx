"use client";

import { AlertTriangle, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { Driver, Job } from "@/lib/types";
import { jobStatus, returnAlert } from "@/lib/logic/status";
import { computeMoney, formatBaht } from "@/lib/logic/pricing";
import { diffDays, formatThaiDate } from "@/lib/logic/dates";

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

/** รับตู้แล้วเกินกี่วันยังไม่จบงาน ถือว่า "วิ่งค้าง" ต้องตามงาน */
export const STALE_RUNNING_DAYS = 3;

type FollowUp = { j: Job; kind: "overdue" | "stale" | "due-soon"; days: number; note: string };

/** แถบ "ต้องติดตาม": คืนตู้เกินกำหนด, รับตู้แล้ววิ่งค้างนาน, ครบกำหนดคืนภายในพรุ่งนี้ */
export function ReturnAlerts({ jobs, today, onJump }: { jobs: Job[]; today: string; onJump: (j: Job) => void }) {
  const items: FollowUp[] = [];
  for (const j of jobs) {
    const a = returnAlert(j, today);
    if (a?.level === "overdue") items.push({ j, kind: "overdue", days: a.days, note: `คืนตู้เกิน ${a.days} วัน (${formatThaiDate(j.return_due_date)})` });
    else if (a?.level === "due-soon") items.push({ j, kind: "due-soon", days: a.days, note: `${a.days === 0 ? "ครบคืนวันนี้" : "ครบคืนพรุ่งนี้"} (${formatThaiDate(j.return_due_date)})` });
    if (jobStatus(j) === "running" && j.pickup_date) {
      const d = diffDays(today, j.pickup_date);
      if (d >= STALE_RUNNING_DAYS) items.push({ j, kind: "stale", days: d, note: `รับตู้ ${formatThaiDate(j.pickup_date)} ยังไม่จบงาน (${d} วัน)` });
    }
  }
  if (!items.length) return null;
  const order = { overdue: 0, stale: 1, "due-soon": 2 };
  items.sort((x, y) => order[x.kind] - order[y.kind] || y.days - x.days);
  const count = (k: FollowUp["kind"]) => items.filter((x) => x.kind === k).length;
  const urgent = count("overdue") + count("stale");

  return (
    <details className="group rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <AlertTriangle className={clsx("size-5 shrink-0", urgent ? "text-rose-600" : "text-amber-600")} aria-hidden />
        <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">ต้องติดตาม</span>
          {count("overdue") > 0 && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-800">คืนตู้เกินกำหนด {count("overdue")}</span>}
          {count("stale") > 0 && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-800">
              วิ่งค้างเกิน {STALE_RUNNING_DAYS} วัน {count("stale")}
            </span>
          )}
          {count("due-soon") > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">ครบคืนภายในพรุ่งนี้ {count("due-soon")}</span>}
        </span>
        <ChevronDown className="size-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto border-t border-slate-200">
        {items.map(({ j, kind, note }) => (
          <li key={`${kind}-${j.id}`}>
            <button type="button" onClick={() => onJump(j)} className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-left text-sm hover:bg-slate-50">
              <span className="w-32 shrink-0 font-mono text-[13px] font-semibold">{j.container_no}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600">
                {j.driver_name || "ยังไม่มีคนขับ"} · แพลน {formatThaiDate(j.plan_date)}
              </span>
              <span className={clsx("shrink-0 text-xs font-medium", kind === "due-soon" ? "text-amber-700" : "text-rose-700")}>{note}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
