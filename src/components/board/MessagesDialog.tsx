"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import clsx from "clsx";
import type { Job, TruckType } from "@/lib/types";
import { buildMessage, MESSAGE_KINDS, type MessageKind } from "@/lib/logic/messages";
import { jobStatus } from "@/lib/logic/status";
import { Modal } from "@/components/ui/Modal";
import { button } from "@/components/ui/styles";

interface Props {
  open: boolean;
  onClose: () => void;
  date: string;
  dayJobs: Job[];
  selectedJobs: Job[];
  initialKind?: MessageKind;
  truckTypeOf: (j: Job) => TruckType | null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function MessagesDialog({ open, onClose, date, dayJobs, selectedJobs, initialKind, truckTypeOf }: Props) {
  const [kind, setKind] = useState<MessageKind>(initialKind ?? "dispatch");
  const [scope, setScope] = useState<"selected" | "day">(selectedJobs.length ? "selected" : "day");
  const [copied, setCopied] = useState<string | null>(null);

  const base = (scope === "selected" && selectedJobs.length ? selectedJobs : dayJobs).filter((j) => !j.cancelled);
  const jobs = useMemo(
    () => (kind === "need-trucks" ? base.filter((j) => jobStatus(j) === "unassigned") : base.filter((j) => j.driver_name)),
    [base, kind],
  );
  const blocks = kind === "need-trucks" ? (jobs.length ? [buildMessage(kind, jobs, { truckTypeOf, date })] : []) : jobs.map((j) => buildMessage(kind, [j], { truckTypeOf, date }));
  const all = blocks.join("\n\n");

  async function doCopy(id: string, text: string) {
    if (await copyText(text)) {
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    }
  }

  const hint = MESSAGE_KINDS.find((k) => k.kind === kind)?.hint;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="ข้อความสำหรับส่ง LINE"
      subtitle={hint}
      footer={
        <>
          <span className="mr-auto text-sm text-slate-500">{kind === "need-trucks" ? `${jobs.length} ตู้ที่ยังไม่มีรถ` : `${jobs.length} ตู้ที่มีคนขับแล้ว`}</span>
          <button type="button" disabled={!all} onClick={() => doCopy("all", all)} className={button("primary")}>
            {copied === "all" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied === "all" ? "คัดลอกแล้ว" : "คัดลอกทั้งหมด"}
          </button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="รูปแบบข้อความ">
        {MESSAGE_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={clsx(
              "h-9 cursor-pointer rounded-lg px-3 text-sm font-medium transition-colors",
              kind === k.kind ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      {selectedJobs.length > 0 && (
        <div className="mb-4 flex gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="scope" checked={scope === "selected"} onChange={() => setScope("selected")} className="accent-blue-800" />
            เฉพาะตู้ที่เลือก ({selectedJobs.length})
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="scope" checked={scope === "day"} onChange={() => setScope("day")} className="accent-blue-800" />
            ทั้งวัน ({dayJobs.filter((j) => !j.cancelled).length})
          </label>
        </div>
      )}
      {blocks.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          {kind === "need-trucks" ? "ทุกตู้มีคนขับแล้ว" : "ยังไม่มีตู้ที่จัดคนขับแล้ว"}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {blocks.map((b, i) => (
            <li key={i} className="relative rounded-xl bg-slate-50 p-3 pr-12 ring-1 ring-slate-200">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{b}</pre>
              <button
                type="button"
                onClick={() => doCopy(`b${i}`, b)}
                aria-label="คัดลอกข้อความนี้"
                className="absolute right-2 top-2 cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-900"
              >
                {copied === `b${i}` ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
