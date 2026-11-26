"use client";

import { Ban, Loader2, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import type { Driver, Job, JobPatch, Lookup, Rate } from "@/lib/types";
import { computeMoney, formatBaht, suggestPrice } from "@/lib/logic/pricing";
import { jobWeightKg } from "@/lib/logic/status";
import { normalizeContainerNo } from "@/lib/logic/container";
import { Modal } from "@/components/ui/Modal";
import { button, input, label } from "@/components/ui/styles";
import { TruckBadge } from "./ui";

interface Props {
  job: Job;
  onClose: () => void;
  driver: Driver | undefined;
  rates: Rate[];
  lookups: Lookup[];
  onSave: (job: Job, patch: JobPatch) => Promise<void>;
  onDelete: (job: Job) => Promise<void>;
  onPickDriver: (jobId: string) => void;
  /** ดูได้อย่างเดียว: ทุกช่องปิด เหลือปุ่ม "ปิด" */
  readOnly: boolean;
}

type Form = Record<
  | "plan_date" | "customer" | "bl_no" | "container_no" | "weight_doc_kg" | "weight_actual_kg" | "port" | "destination" | "job_type"
  | "shipping" | "pickup_date" | "end_date" | "return_due_date" | "return_date" | "price" | "overweight_fee" | "overnight_fee"
  | "other_fee" | "note",
  string
>;

const NUM_FIELDS = ["weight_doc_kg", "weight_actual_kg", "price", "overweight_fee", "overnight_fee", "other_fee"] as const;
const DATE_FIELDS = ["plan_date", "pickup_date", "end_date", "return_due_date", "return_date"] as const;

function toForm(j: Job): Form {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    plan_date: s(j.plan_date), customer: s(j.customer), bl_no: s(j.bl_no), container_no: s(j.container_no),
    weight_doc_kg: s(j.weight_doc_kg), weight_actual_kg: s(j.weight_actual_kg), port: s(j.port), destination: s(j.destination),
    job_type: s(j.job_type), shipping: s(j.shipping), pickup_date: s(j.pickup_date), end_date: s(j.end_date),
    return_due_date: s(j.return_due_date), return_date: s(j.return_date), price: s(j.price), overweight_fee: s(j.overweight_fee),
    overnight_fee: s(j.overnight_fee), other_fee: s(j.other_fee), note: s(j.note),
  };
}

function toPatch(j: Job, f: Form): JobPatch {
  const before = toForm(j);
  const patch: Record<string, unknown> = {};
  (Object.keys(f) as (keyof Form)[]).forEach((k) => {
    if (f[k] === before[k]) return;
    const raw = f[k].trim();
    if ((NUM_FIELDS as readonly string[]).includes(k)) patch[k] = raw === "" ? null : Number(raw.replace(/,/g, ""));
    else if ((DATE_FIELDS as readonly string[]).includes(k)) patch[k] = raw || null;
    else if (k === "container_no") patch[k] = normalizeContainerNo(raw);
    else patch[k] = raw || null;
  });
  if ("price" in patch) patch.price_manual = patch.price !== null;
  return patch as JobPatch;
}

export function JobDialog({ job, onClose, driver, rates, lookups, onSave, onDelete, onPickDriver, readOnly }: Props) {
  const [f, setF] = useState<Form>(() => toForm(job));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });
  const draft = { ...job, ...toPatch(job, f) } as Job;
  const money = computeMoney(draft, driver?.truck_type ?? null);
  const suggested = driver ? suggestPrice(rates, { destination: draft.destination, truckType: driver.truck_type, weightKg: jobWeightKg(draft) }) : null;
  const destinations = lookups.filter((l) => l.kind === "destination").map((l) => l.value);
  const jobTypes = lookups.filter((l) => l.kind === "job_type").map((l) => l.value);
  const ports = lookups.filter((l) => l.kind === "port").map((l) => l.value);

  async function save() {
    const patch = toPatch(job, f);
    if (!Object.keys(patch).length) return onClose();
    if (!f.container_no.trim() || !f.plan_date) {
      setError("ต้องมีเลขตู้และวันที่แพลน");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(job, patch);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const text = (k: keyof Form, l: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`jd-${k}`} className={label}>
        {l}
      </label>
      <input id={`jd-${k}`} value={f[k]} onChange={set(k)} className={input} {...extra} />
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={<span className="font-mono">{job.container_no}</span>}
      subtitle={job.bl_no ? `BL ${job.bl_no}` : undefined}
      footer={
        readOnly ? (
          <button type="button" className={button("secondary")} onClick={onClose}>
            ปิด
          </button>
        ) : (
        <>
          {!job.pickup_date && (
            <button
              type="button"
              className={button("danger", "md", "mr-auto")}
              onClick={async () => {
                if (!window.confirm(`ลบตู้ ${job.container_no} ออกจากแพลน?`)) return;
                setBusy(true);
                try {
                  await onDelete(job);
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              ลบตู้
            </button>
          )}
          <button
            type="button"
            className={button("ghost", "md", job.pickup_date ? "mr-auto" : undefined)}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(job, { cancelled: !job.cancelled });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            <Ban className="size-4" aria-hidden />
            {job.cancelled ? "เลิกยกเลิก" : "ยกเลิกตู้นี้"}
          </button>
          <button type="button" className={button("secondary")} onClick={onClose}>
            ปิด
          </button>
          <button type="button" className={button("primary")} onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            บันทึก
          </button>
        </>
        )
      }
    >
      <fieldset disabled={readOnly} className="min-w-0 space-y-6">
        <section className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <UserRound className="size-5 text-slate-500" aria-hidden />
          <div className="min-w-0 flex-1">
            {job.driver_name ? (
              <>
                <p className="flex items-center gap-2 font-medium">
                  {job.driver_name} <TruckBadge type={driver?.truck_type} />
                </p>
                <p className="text-sm text-slate-500">{[job.truck_no, job.phone].filter(Boolean).join(" · ")}</p>
                <p className="text-xs text-slate-500">{[job.bank, job.account_no, job.account_name].filter(Boolean).join(" · ")}</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">ยังไม่มีคนขับ</p>
            )}
          </div>
          {!readOnly && (
            <button type="button" onClick={() => onPickDriver(job.id)} className={button("secondary", "sm")}>
              {job.driver_name ? "เปลี่ยนคนขับ" : "เลือกคนขับ"}
            </button>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">ข้อมูลตู้</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {text("container_no", "เลขตู้", { className: `${input} font-mono uppercase` })}
            {text("bl_no", "BL no.")}
            {text("customer", "ลูกค้า")}
            {text("weight_doc_kg", "น้ำหนักตามเอกสาร (กก.)", { inputMode: "decimal" })}
            {text("weight_actual_kg", "น้ำหนักจริง (กก.)", { inputMode: "decimal" })}
            {text("port", "ท่า / ต้นทางปล่อยตู้", { list: "jd-ports" })}
            <datalist id="jd-ports">
              {ports.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <div>
              <label htmlFor="jd-destination" className={label}>
                ปลายทาง
              </label>
              <select id="jd-destination" value={f.destination} onChange={set("destination")} className={input}>
                <option value="">–</option>
                {[...new Set([...destinations, f.destination].filter(Boolean))].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="jd-job_type" className={label}>
                ประเภทงาน
              </label>
              <select id="jd-job_type" value={f.job_type} onChange={set("job_type")} className={input}>
                <option value="">–</option>
                {[...new Set([...jobTypes, f.job_type].filter(Boolean))].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            {text("shipping", "ชิปปิ้ง")}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">วันที่</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {text("plan_date", "วันที่แพลน", { type: "date" })}
            {text("pickup_date", "วันที่รับตู้", { type: "date" })}
            {text("end_date", "วันที่จบงาน", { type: "date" })}
            {text("return_due_date", "วันที่ต้องคืนตู้", { type: "date" })}
            {text("return_date", "วันที่คืนตู้จริง", { type: "date" })}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">ค่าใช้จ่าย (ชำระครั้งที่ 1)</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              {text("price", "ค่าเที่ยว", { inputMode: "decimal", placeholder: suggested ? formatBaht(suggested) : "" })}
              {suggested !== null && Number(f.price || NaN) !== suggested && (
                <button type="button" onClick={() => setF({ ...f, price: String(suggested) })} className="mt-1 cursor-pointer text-xs font-medium text-blue-800 hover:underline">
                  ใช้ราคาแนะนำ ฿{formatBaht(suggested)}
                </button>
              )}
            </div>
            {text("overweight_fee", "ค่าน้ำหนักเกิน", { inputMode: "decimal" })}
            {text("overnight_fee", "ค่าค้างคืน", { inputMode: "decimal" })}
            {text("other_fee", "อื่น ๆ", { inputMode: "decimal" })}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
            <div>
              <dt className="text-xs text-slate-500">รวม</dt>
              <dd className="font-semibold tabular-nums">฿{formatBaht(money.gross)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">หัก ณ ที่จ่าย {driver?.truck_type === "partner" ? "1%" : ""}</dt>
              <dd className="font-semibold tabular-nums">฿{formatBaht(money.whTax)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">ยอดโอนสุทธิ</dt>
              <dd className="font-semibold tabular-nums text-blue-900">฿{formatBaht(money.net)}</dd>
            </div>
          </dl>
        </section>

        <div>
          <label htmlFor="jd-note" className={label}>
            หมายเหตุ
          </label>
          <textarea id="jd-note" rows={2} value={f.note} onChange={set("note")} className={input} />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
      </fieldset>
    </Modal>
  );
}
