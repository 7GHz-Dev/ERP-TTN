"use client";

import {
  ArrowRight,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import clsx from "clsx";
import type { Driver, Job, JobPatch, Rate } from "@/lib/types";
import { jobStatus, jobWeightKg, nextStep, returnAlert, type JobStatus, type StepField } from "@/lib/logic/status";
import { suggestPrice, formatBaht } from "@/lib/logic/pricing";
import { formatThaiDate } from "@/lib/logic/dates";
import { StatusPill, TruckBadge, formatTons } from "./ui";
import { button, input } from "@/components/ui/styles";

export type Filter = "all" | JobStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "unassigned", label: "รอจัดรถ" },
  { key: "assigned", label: "จัดรถแล้ว" },
  { key: "running", label: "กำลังวิ่ง" },
  { key: "done", label: "ปิดงาน" },
];

interface Props {
  dayJobs: Job[];
  jobs: Job[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  query: string;
  setQuery: (q: string) => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  driversById: Map<string, Driver>;
  rates: Rate[];
  today: string;
  loading: boolean;
  onPick: (jobId: string) => void;
  onPatch: (job: Job, patch: JobPatch) => void;
  onStep: (jobs: Job[], field: StepField) => void;
  onEdit: (jobId: string) => void;
  onAutoAssign: () => void;
  onMessages: () => void;
  onImport: () => void;
  onClearDrivers: (jobs: Job[]) => void;
}

export function JobList(p: Props) {
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, unassigned: 0, assigned: 0, running: 0, done: 0, cancelled: 0 };
    for (const j of p.dayJobs) {
      const s = jobStatus(j);
      c[s]++;
      if (s !== "cancelled") c.all++;
    }
    return c;
  }, [p.dayJobs]);

  const groups = useMemo(() => {
    const m = new Map<string, Job[]>();
    for (const j of p.jobs) {
      const k = j.bl_no?.trim() || "";
      m.set(k, [...(m.get(k) ?? []), j]);
    }
    return [...m.entries()];
  }, [p.jobs]);

  const selectedJobs = p.jobs.filter((j) => p.selected.has(j.id));
  const allSelected = p.jobs.length > 0 && selectedJobs.length === p.jobs.length;

  const toggle = (id: string) => {
    const s = new Set(p.selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    p.setSelected(s);
  };

  const bulkSteps = (["pickup_date", "end_date", "return_date"] as StepField[])
    .map((field) => ({ field, jobs: selectedJobs.filter((j) => nextStep(j)?.field === field) }))
    .filter((x) => x.jobs.length > 0);
  const stepLabel: Record<StepField, string> = { pickup_date: "รับตู้แล้ว", end_date: "จบงาน", return_date: "คืนตู้แล้ว" };

  return (
    <section aria-label="รายการตู้" className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      {/* toolbar */}
      <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="กรองตามสถานะ">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              type="button"
              aria-selected={p.filter === f.key}
              onClick={() => p.setFilter(f.key)}
              className={clsx(
                "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
                p.filter === f.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {f.label}
              <span
                className={clsx(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  p.filter === f.key ? "bg-white/20" : f.key === "unassigned" && counts.unassigned > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100",
                )}
              >
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-auto lg:max-w-52">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={p.query}
              onChange={(e) => p.setQuery(e.target.value)}
              placeholder="ค้นหาเลขตู้ BL คนขับ"
              aria-label="ค้นหาตู้"
              className={clsx(input, "h-9 py-1.5 pl-9")}
            />
          </div>
          <button type="button" onClick={p.onAutoAssign} disabled={counts.unassigned === 0} className={button("accent", "md", "h-9")}>
            <Sparkles className="size-4" aria-hidden />
            จัดรถอัตโนมัติ
            {counts.unassigned > 0 && <span className="rounded-full bg-slate-950/10 px-1.5 text-xs tabular-nums">{counts.unassigned}</span>}
          </button>
          <button type="button" onClick={p.onMessages} disabled={counts.all === 0} className={button("secondary", "md", "h-9")}>
            <MessageSquareText className="size-4" aria-hidden />
            ข้อความ LINE
          </button>
        </div>
      </div>

      {/* bulk bar */}
      {selectedJobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-3 py-2 text-sm">
          <span className="font-medium text-blue-900">เลือก {selectedJobs.length} ตู้</span>
          {bulkSteps.map((b) => (
            <button key={b.field} type="button" className={button("secondary", "sm")} onClick={() => p.onStep(b.jobs, b.field)}>
              {stepLabel[b.field]} ({b.jobs.length})
            </button>
          ))}
          {selectedJobs.some((j) => j.driver_id && !j.pickup_date) && (
            <button type="button" className={button("secondary", "sm")} onClick={() => p.onClearDrivers(selectedJobs.filter((j) => j.driver_id && !j.pickup_date))}>
              ล้างคนขับ
            </button>
          )}
          <button type="button" className={button("secondary", "sm")} onClick={p.onMessages}>
            <MessageSquareText className="size-4" aria-hidden />
            ข้อความ
          </button>
          <button type="button" className={button("ghost", "sm", "ml-auto")} onClick={() => p.setSelected(new Set())}>
            <X className="size-4" aria-hidden />
            ยกเลิกเลือก
          </button>
        </div>
      )}

      {/* empty */}
      {p.jobs.length === 0 && !p.loading && (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-slate-100">
            <ClipboardList className="size-6 text-slate-500" aria-hidden />
          </div>
          {counts.all === 0 ? (
            <>
              <p className="font-medium">ยังไม่มีแพลนลากตู้วันนี้</p>
              <p className="max-w-sm text-sm text-slate-500">คัดลอกรายการตู้จาก Excel หรือข้อความ LINE ที่ partner ส่งมา แล้ววางในหน้านำเข้าแพลน</p>
              <button type="button" onClick={p.onImport} className={button("primary", "md")}>
                <Plus className="size-4" aria-hidden />
                นำเข้าแพลน
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500">ไม่มีตู้ตามตัวกรองนี้</p>
          )}
        </div>
      )}
      {p.loading && p.jobs.length === 0 && (
        <div className="space-y-2 p-4" aria-busy="true" aria-label="กำลังโหลด">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {/* desktop table */}
      {p.jobs.length > 0 && (
        <div className="hidden md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="w-10 py-2 pl-3">
                  <input
                    type="checkbox"
                    aria-label="เลือกทั้งหมด"
                    checked={allSelected}
                    onChange={() => p.setSelected(allSelected ? new Set() : new Set(p.jobs.map((j) => j.id)))}
                    className="size-4 cursor-pointer accent-blue-800"
                  />
                </th>
                <th className="py-2 pr-3">เลขตู้</th>
                <th className="py-2 pr-3 text-right">ตัน</th>
                <th className="py-2 pr-3">เส้นทาง</th>
                <th className="py-2 pr-3">คนขับ</th>
                <th className="py-2 pr-3 text-right">ค่าเที่ยว</th>
                <th className="py-2 pr-3">สถานะ</th>
                <th className="w-10 py-2 pr-2">
                  <span className="sr-only">เพิ่มเติม</span>
                </th>
              </tr>
            </thead>
            {groups.map(([bl, rows]) => (
              <tbody key={bl || "_"}>
                <GroupHeader bl={bl} rows={rows} colSpan={8} />
                {rows.map((j) => (
                  <JobRow key={j.id} j={j} {...p} checked={p.selected.has(j.id)} toggle={() => toggle(j.id)} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {/* mobile cards */}
      {p.jobs.length > 0 && (
        <div className="md:hidden">
          <label className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => p.setSelected(allSelected ? new Set() : new Set(p.jobs.map((j) => j.id)))}
              className="size-4 accent-blue-800"
            />
            เลือกทั้งหมด
          </label>
          {groups.map(([bl, rows]) => (
            <div key={bl || "_"}>
              <MobileGroupHeader bl={bl} rows={rows} />
              {rows.map((j) => (
                <JobCard key={j.id} j={j} {...p} checked={p.selected.has(j.id)} toggle={() => toggle(j.id)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function groupMeta(rows: Job[]) {
  const live = rows.filter((j) => !j.cancelled);
  const missing = live.filter((j) => jobStatus(j) === "unassigned").length;
  const customer = [...new Set(live.map((j) => j.customer).filter(Boolean))].join(", ");
  return { live, missing, customer };
}

function GroupHeader({ bl, rows, colSpan }: { bl: string; rows: Job[]; colSpan: number }) {
  const { live, missing, customer } = groupMeta(rows);
  return (
    <tr className="bg-slate-50/80">
      <td colSpan={colSpan} className="border-y border-slate-200 px-3 py-1.5 text-xs text-slate-600">
        <span className="font-semibold text-slate-900">{bl ? `BL ${bl}` : "ไม่ระบุ BL"}</span>
        {customer && <span> · {customer}</span>}
        <span> · {live.length} ตู้</span>
        {missing > 0 && <span className="ml-2 font-medium text-amber-700">ยังไม่จัดรถ {missing}</span>}
      </td>
    </tr>
  );
}

function MobileGroupHeader({ bl, rows }: { bl: string; rows: Job[] }) {
  const { live, missing, customer } = groupMeta(rows);
  return (
    <div className="border-y border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
      <span className="font-semibold text-slate-900">{bl ? `BL ${bl}` : "ไม่ระบุ BL"}</span>
      {customer && <span> · {customer}</span>} · {live.length} ตู้
      {missing > 0 && <span className="ml-2 font-medium text-amber-700">ขาด {missing}</span>}
    </div>
  );
}

type RowProps = Props & { j: Job; checked: boolean; toggle: () => void };

function isInteractive(e: MouseEvent) {
  return Boolean((e.target as HTMLElement).closest("button,a,input,label,select,textarea"));
}

function ReturnBadge({ j, today }: { j: Job; today: string }) {
  const a = returnAlert(j, today);
  if (!a || a.level === "returned-late") return null;
  return (
    <span
      className={clsx(
        "inline-flex whitespace-nowrap rounded px-1.5 py-px text-[11px] font-medium",
        a.level === "overdue" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800",
      )}
      title={`ต้องคืนตู้ ${formatThaiDate(j.return_due_date)}`}
    >
      {a.level === "overdue" ? `คืนตู้เกิน ${a.days} วัน` : a.days === 0 ? "คืนตู้วันนี้" : "คืนตู้พรุ่งนี้"}
    </span>
  );
}

function DriverCell({ j, driversById, onPick, compact }: RowProps & { compact?: boolean }) {
  const d = j.driver_id ? driversById.get(j.driver_id) : undefined;
  const locked = Boolean(j.pickup_date) || j.cancelled;
  if (!j.driver_name) {
    return (
      <button
        type="button"
        onClick={() => onPick(j.id)}
        disabled={j.cancelled}
        className={clsx(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-amber-400 bg-amber-50/60 px-2.5 font-medium text-amber-800 hover:bg-amber-50",
          compact ? "h-10 w-full justify-center" : "h-8",
        )}
      >
        <UserRoundPlus className="size-4" aria-hidden />
        เลือกคนขับ
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onPick(j.id)}
      disabled={locked}
      title={locked ? "รับตู้แล้ว เปลี่ยนคนขับได้ที่หน้าแก้ไข" : "เปลี่ยนคนขับ"}
      className={clsx(
        "group/driver -mx-1.5 flex min-w-0 max-w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left",
        !locked && "cursor-pointer hover:bg-slate-100",
        compact && "w-full",
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{j.driver_name}</span>
          <TruckBadge type={d?.truck_type} />
        </span>
        <span className="block truncate text-xs text-slate-500">{[j.truck_no, j.phone].filter(Boolean).join(" · ")}</span>
      </span>
      {!locked && <ChevronDown className="size-4 shrink-0 text-slate-400 group-hover/driver:text-slate-600" aria-hidden />}
    </button>
  );
}

function PriceInput({ j, rates, driversById, onPatch }: RowProps) {
  const d = j.driver_id ? driversById.get(j.driver_id) : undefined;
  const suggested = d ? suggestPrice(rates, { destination: j.destination, truckType: d.truck_type, weightKg: jobWeightKg(j) }) : null;
  const [val, setVal] = useState(j.price?.toString() ?? "");
  const [editing, setEditing] = useState(false);

  function commit() {
    const raw = val.replace(/,/g, "").trim();
    const num = raw === "" ? null : Number(raw);
    if (num !== null && Number.isNaN(num)) {
      setVal(j.price?.toString() ?? "");
      return;
    }
    if (num === j.price) return;
    onPatch(j, { price: num, price_manual: num !== null });
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? val : val && !Number.isNaN(Number(val.replace(/,/g, ""))) ? formatBaht(Number(val.replace(/,/g, ""))) : val}
      placeholder={suggested ? formatBaht(suggested) : "–"}
      aria-label={`ค่าเที่ยว ${j.container_no}`}
      disabled={j.cancelled}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        setEditing(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setVal(j.price?.toString() ?? "");
          (e.target as HTMLInputElement).blur();
        }
      }}
      onFocus={(e) => {
        setEditing(true);
        const el = e.target;
        requestAnimationFrame(() => el.select());
      }}
      className="h-8 w-24 rounded-md border-0 bg-transparent px-2 text-right tabular-nums ring-1 ring-inset ring-transparent hover:ring-slate-300 focus:bg-white focus:ring-2 focus:ring-blue-700 focus:outline-none"
    />
  );
}

function StepButton({ j, onStep, size = "sm" }: RowProps & { size?: "sm" | "md" }) {
  const step = nextStep(j);
  if (!step) return null;
  return (
    <button type="button" onClick={() => onStep([j], step.field)} className={button("secondary", size)}>
      <CheckSquare className="size-4 text-slate-500" aria-hidden />
      {step.label}
    </button>
  );
}

function JobRow(props: RowProps) {
  const { j, checked, toggle, activeId, setActiveId, onEdit, today } = props;
  const status = jobStatus(j);
  const active = activeId === j.id;
  return (
    <tr
      onClick={(e) => !isInteractive(e) && setActiveId(active ? null : j.id)}
      aria-selected={active}
      className={clsx(
        "border-b border-slate-100 align-middle transition-colors",
        active ? "bg-blue-50 outline-2 -outline-offset-2 outline-blue-600" : checked ? "bg-blue-50/40" : "hover:bg-slate-50",
        j.cancelled && "opacity-50",
      )}
    >
      <td className="py-2 pl-3">
        <input type="checkbox" aria-label={`เลือก ${j.container_no}`} checked={checked} onChange={toggle} className="size-4 cursor-pointer accent-blue-800" />
      </td>
      <td className="py-2 pr-3">
        <div className="font-mono text-[13px] font-semibold tracking-tight">{j.container_no}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {j.job_type && <span className="truncate">{j.job_type}</span>}
          <ReturnBadge j={j} today={today} />
        </div>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{formatTons(jobWeightKg(j))}</td>
      <td className="py-2 pr-3">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span className="rounded bg-slate-100 px-1.5 py-px font-mono text-xs font-medium">{j.port || "–"}</span>
          <ArrowRight className="size-3.5 text-slate-400" aria-hidden />
          <span>{j.destination || "–"}</span>
        </span>
      </td>
      <td className="max-w-64 py-2 pr-3">
        <DriverCell {...props} />
      </td>
      <td className="py-2 pr-1 text-right">
        <PriceInput key={`${j.id}:${j.price}`} {...props} />
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          <StepButton {...props} />
        </div>
      </td>
      <td className="py-2 pr-2">
        <button type="button" onClick={() => onEdit(j.id)} aria-label={`แก้ไข ${j.container_no}`} className="cursor-pointer rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <MoreHorizontal className="size-5" aria-hidden />
        </button>
      </td>
    </tr>
  );
}

function JobCard(props: RowProps) {
  const { j, checked, toggle, onEdit, today } = props;
  const status = jobStatus(j);
  return (
    <div className={clsx("border-b border-slate-100 px-3 py-3", checked && "bg-blue-50/50", j.cancelled && "opacity-50")}>
      <div className="flex items-start gap-3">
        <input type="checkbox" aria-label={`เลือก ${j.container_no}`} checked={checked} onChange={toggle} className="mt-1 size-5 accent-blue-800" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[15px] font-semibold">{j.container_no}</span>
            <StatusPill status={status} />
          </div>
          <p className="mt-0.5 text-sm text-slate-600">
            {formatTons(jobWeightKg(j))} ตัน · {j.port || "–"} → {j.destination || "–"}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-slate-500">
            {j.job_type && <span>{j.job_type}</span>}
            <ReturnBadge j={j} today={today} />
          </div>
          <div className="mt-2">
            <DriverCell {...props} compact />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">ค่าเที่ยว</span>
            <PriceInput key={`${j.id}:${j.price}`} {...props} />
            <div className="ml-auto flex items-center gap-1">
              <StepButton {...props} size="md" />
              <button type="button" onClick={() => onEdit(j.id)} aria-label={`แก้ไข ${j.container_no}`} className="rounded-md p-2.5 text-slate-500 hover:bg-slate-100">
                <MoreHorizontal className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
