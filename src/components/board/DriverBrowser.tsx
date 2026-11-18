"use client";

import { CalendarOff, Phone, Search } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";
import type { Driver, Job } from "@/lib/types";
import { acceptsHeavy, canHaulContainer, isHeavy, type RankedDriver } from "@/lib/logic/assign";
import { diffDays, formatThaiDate } from "@/lib/logic/dates";
import { DriverStateLabel, TruckBadge } from "./ui";
import { input } from "@/components/ui/styles";

type Show = "free" | "all";
type TypeFilter = "all" | "company" | "partner";

interface Props {
  date: string;
  ranked: RankedDriver[];
  lastJobDate: Map<string, string | null>;
  onPick?: (d: Driver) => void;
  /** เมื่อไม่มีตู้ที่กำลังเลือก ปุ่มคนขับจะไม่ทำอะไร */
  pickEnabled?: boolean;
  currentDriverId?: string | null;
  onLeave?: (d: Driver) => void;
  autoFocus?: boolean;
  header?: ReactNode;
  defaultShow?: Show;
  listClassName?: string;
  /** ตู้ที่กำลังเลือกคนขับ ใช้เตือนคนขับที่ไม่เหมาะกับตู้นี้ */
  job?: Job | null;
}

function normalize(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/\s+/g, "");
}

export function DriverBrowser({
  date,
  ranked,
  lastJobDate,
  onPick,
  pickEnabled = true,
  currentDriverId,
  onLeave,
  autoFocus,
  header,
  defaultShow = "free",
  listClassName,
  job,
}: Props) {
  const heavyJob = job ? isHeavy(job) : false;
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>(defaultShow);
  const [type, setType] = useState<TypeFilter>("all");
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const freeCount = ranked.filter((r) => r.status.state === "free").length;
  const filtered = useMemo(() => {
    const nq = normalize(q);
    return ranked.filter((r) => {
      if (!r.driver.active && show === "free") return false;
      if (show === "free" && r.status.state !== "free") return false;
      if (type !== "all" && r.driver.truck_type !== type) return false;
      if (!nq) return true;
      const d = r.driver;
      return [d.name, d.truck_no, d.phone, d.fleet, d.id].some((f) => normalize(f).includes(nq));
    });
  }, [ranked, q, show, type]);

  const company = filtered.filter((r) => r.driver.truck_type === "company");
  const partner = filtered.filter((r) => r.driver.truck_type === "partner");
  const flat = [...company, ...partner];

  function onKey(e: KeyboardEvent) {
    if (!flat.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(flat.length - 1, hi + (e.key === "ArrowDown" ? 1 : -1)));
      setHi(next);
      listRef.current?.querySelector<HTMLElement>(`[data-idx="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && onPick && pickEnabled) {
      e.preventDefault();
      onPick(flat[Math.min(hi, flat.length - 1)].driver);
    }
  }

  const group = (title: string, rows: RankedDriver[], offset: number, total: number) =>
    rows.length === 0 ? (
      show === "free" && total > 0 && type !== (title === "รถบริษัท" ? "partner" : "company") && !q ? (
        <li key={title}>
          <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {title} <span className="font-normal normal-case text-amber-700">— ไม่มีว่าง (ทั้งหมด {total} คัน)</span>
          </p>
        </li>
      ) : null
    ) : (
      <li key={title}>
        <p className="sticky top-0 z-[1] bg-white/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
          {title} <span className="font-normal normal-case">({rows.length}{show === "free" ? ` จาก ${total}` : ""})</span>
        </p>
        <ul>
          {rows.map((r, i) => (
            <DriverRow
              key={r.driver.id}
              idx={offset + i}
              r={r}
              date={date}
              last={lastJobDate.get(r.driver.id) ?? null}
              highlighted={hi === offset + i}
              current={currentDriverId === r.driver.id}
              onPick={onPick && pickEnabled ? () => onPick(r.driver) : undefined}
              onLeave={onLeave ? () => onLeave(r.driver) : undefined}
              warning={
                !job ? null : !canHaulContainer(r.driver) ? "ไม่ใช่รถลากตู้" : heavyJob && !acceptsHeavy(r.driver) ? "รับเฉพาะงานเบา" : null
              }
            />
          ))}
        </ul>
      </li>
    );

  const companyTotal = ranked.filter((r) => r.driver.truck_type === "company" && r.driver.active).length;
  const partnerTotal = ranked.filter((r) => r.driver.truck_type === "partner" && r.driver.active).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={q}
            autoFocus={autoFocus}
            onChange={(e) => {
              setQ(e.target.value);
              setHi(0);
            }}
            onKeyDown={onKey}
            placeholder="ค้นหาชื่อ ทะเบียน เบอร์ สังกัด"
            aria-label="ค้นหาคนขับ"
            className={clsx(input, "pl-9")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Seg value={show} onChange={(v) => { setShow(v); setHi(0); }} options={[["free", `ว่าง ${freeCount}`], ["all", `ทั้งหมด ${ranked.length}`]]} />
          <Seg value={type} onChange={(v) => { setType(v); setHi(0); }} options={[["all", "ทุกประเภท"], ["company", "บริษัท"], ["partner", "รถร่วม"]]} />
        </div>
      </div>
      <ul ref={listRef} className={clsx("min-h-0 flex-1 overflow-y-auto", listClassName)}>
        {flat.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-slate-500">
            {show === "free" ? "ไม่มีคนขับว่างตามเงื่อนไขนี้ — ลองดู “ทั้งหมด” หรือหารถร่วมเพิ่ม" : "ไม่พบคนขับ"}
          </li>
        )}
        {group("รถบริษัท", company, 0, companyTotal)}
        {group("รถร่วม", partner, company.length, partnerTotal)}
      </ul>
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="group">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={clsx(
            "cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors",
            value === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function DriverRow({
  r,
  idx,
  date,
  last,
  highlighted,
  current,
  onPick,
  onLeave,
  warning,
}: {
  warning: string | null;
  r: RankedDriver;
  idx: number;
  date: string;
  last: string | null;
  highlighted: boolean;
  current: boolean;
  onPick?: () => void;
  onLeave?: () => void;
}) {
  const d = r.driver;
  const s = r.status;
  let detail: ReactNode = null;
  if (s.state === "off") {
    detail = !d.active ? "ปิดใช้งาน" : `${s.leave?.note || "ไม่ว่าง"}${s.leave?.end_date ? ` ถึง ${formatThaiDate(s.leave.end_date)}` : ""}`;
  } else if (s.state === "running" || s.state === "busy") {
    detail = s.jobs.map((j) => j.container_no).join(", ");
  } else if (last) {
    const idle = diffDays(date, last);
    detail = `งานล่าสุด ${formatThaiDate(last)}${idle > 0 ? ` · ว่าง ${idle} วัน` : ""}`;
  } else {
    detail = "ยังไม่มีประวัติงาน";
  }

  const body = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span className={clsx("truncate font-medium", s.state === "off" && "text-slate-500")}>{d.name}</span>
        <TruckBadge type={d.truck_type} />
        {current && <span className="rounded bg-blue-100 px-1.5 text-[11px] font-semibold text-blue-800">คนขับปัจจุบัน</span>}
        {warning && <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{warning}</span>}
      </div>
      <p className="mt-0.5 truncate text-xs text-slate-500">
        {[d.truck_no, d.job_class, d.fleet].filter(Boolean).join(" · ") || "–"}
      </p>
      <p className="mt-1 flex min-w-0 items-center gap-2 text-xs">
        <DriverStateLabel state={s.state} />
        <span className="truncate text-slate-500">{detail}</span>
      </p>
    </>
  );

  return (
    <li data-idx={idx} className={clsx("group flex items-stretch border-b border-slate-100", highlighted && "bg-blue-50/60")}>
      {onPick ? (
        <button type="button" onClick={onPick} className="min-w-0 flex-1 cursor-pointer px-3 py-2.5 text-left hover:bg-blue-50">
          {body}
        </button>
      ) : (
        <div className="min-w-0 flex-1 px-3 py-2.5">{body}</div>
      )}
      <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 pr-1.5">
        {d.phone && (
          <a href={`tel:${d.phone.replace(/[^\d+]/g, "")}`} aria-label={`โทรหา ${d.name}`} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <Phone className="size-4" aria-hidden />
          </a>
        )}
        {onLeave && (
          <button type="button" onClick={onLeave} aria-label={`แจ้งวันไม่ว่างของ ${d.name}`} title="แจ้งวันไม่ว่าง" className="cursor-pointer rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <CalendarOff className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}
