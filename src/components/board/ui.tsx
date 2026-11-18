import clsx from "clsx";
import type { TruckType } from "@/lib/types";
import { JOB_STATUS_LABEL, type JobStatus } from "@/lib/logic/status";
import { DRIVER_STATE_LABEL, type DriverState } from "@/lib/logic/availability";

export const STATUS_STYLE: Record<JobStatus, string> = {
  unassigned: "bg-amber-50 text-amber-800 ring-amber-300",
  assigned: "bg-blue-50 text-blue-800 ring-blue-200",
  running: "bg-violet-50 text-violet-800 ring-violet-200",
  done: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
};

export const STATUS_DOT: Record<JobStatus, string> = {
  unassigned: "bg-amber-500",
  assigned: "bg-blue-600",
  running: "bg-violet-600",
  done: "bg-emerald-600",
  cancelled: "bg-slate-400",
};

export function StatusPill({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STATUS_STYLE[status],
        className,
      )}
    >
      <span className={clsx("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {JOB_STATUS_LABEL[status]}
    </span>
  );
}

export function TruckBadge({ type, className }: { type: TruckType | null | undefined; className?: string }) {
  if (!type) return null;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded px-1.5 py-px text-[11px] font-semibold leading-4",
        type === "company" ? "bg-blue-900 text-white" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300",
        className,
      )}
    >
      {type === "company" ? "บริษัท" : "รถร่วม"}
    </span>
  );
}

export const DRIVER_STATE_STYLE: Record<DriverState, { dot: string; text: string }> = {
  free: { dot: "bg-emerald-500", text: "text-emerald-700" },
  busy: { dot: "bg-blue-600", text: "text-blue-700" },
  running: { dot: "bg-violet-600", text: "text-violet-700" },
  off: { dot: "bg-slate-400", text: "text-slate-500" },
};

export function DriverStateLabel({ state }: { state: DriverState }) {
  const s = DRIVER_STATE_STYLE[state];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium", s.text)}>
      <span className={clsx("size-2 rounded-full", s.dot)} aria-hidden />
      {DRIVER_STATE_LABEL[state]}
    </span>
  );
}

export function formatTons(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return "–";
  return (kg / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
