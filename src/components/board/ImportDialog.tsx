"use client";

import { AlertTriangle, ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { Job, Lookup } from "@/lib/types";
import { parsePlanText, type ParseWarning } from "@/lib/logic/parse-plan";
import { isValidContainerNo, normalizeContainerNo } from "@/lib/logic/container";
import { addDays, formatThaiDate } from "@/lib/logic/dates";
import { findOpenContainers, type NewJobInput, type NewPlanInput } from "@/lib/data";
import { Modal } from "@/components/ui/Modal";
import { button, input, label } from "@/components/ui/styles";

interface Row {
  key: string;
  container_no: string;
  bl_no: string;
  weight_kg: string;
  port: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  date: string;
  lookups: Lookup[];
  recentCustomers: string[];
  recentShipping: string[];
  onSave: (plan: NewPlanInput, jobs: NewJobInput[], opts: { autoAssign: boolean }) => Promise<void>;
}

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;

const EXAMPLE = `ตัวอย่างที่วางได้:

BL: ABCD12345678
ABCU1234560  10.9 ตัน  C3
XYZU7654323  13,930    C1C2

หรือคัดลอกหลายคอลัมน์จาก Excel (เลขตู้ / BL / น้ำหนัก / ท่า ลำดับไหนก็ได้)`;

export function ImportDialog({ open, onClose, date, lookups, recentCustomers, recentShipping, onSave }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [planDate, setPlanDate] = useState(date);
  const [customer, setCustomer] = useState("");
  const [shipping, setShipping] = useState(recentShipping[0] ?? "KOLA SHIPPING");
  const [jobType, setJobType] = useState("");
  const [destination, setDestination] = useState("");
  const [port, setPort] = useState("");
  const [bl, setBl] = useState("");
  const [returnDue, setReturnDue] = useState("");
  const [autoAssign, setAutoAssign] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Map<string, Job>>(new Map());

  const ports = useMemo(() => lookups.filter((l) => l.kind === "port").map((l) => l.value), [lookups]);
  const destinations = lookups.filter((l) => l.kind === "destination").map((l) => l.value);
  const jobTypes = lookups.filter((l) => l.kind === "job_type").map((l) => l.value);

  const parsed = useMemo(() => parsePlanText(text, { ports }), [text, ports]);

  // ตรวจตู้ที่มีงานค้างอยู่แล้วในระบบ
  const containerKey = rows.map((r) => normalizeContainerNo(r.container_no)).filter(Boolean).sort().join(",");
  useEffect(() => {
    if (step !== 2 || !containerKey) return;
    const t = window.setTimeout(() => {
      findOpenContainers(containerKey.split(","))
        .then(setExisting)
        .catch(() => setExisting(new Map()));
    }, 400);
    return () => window.clearTimeout(t);
  }, [containerKey, step]);

  function goReview() {
    setRows(
      parsed.map((r) => ({
        key: newKey(),
        container_no: r.container_no,
        bl_no: r.bl_no ?? "",
        weight_kg: r.weight_kg?.toString() ?? "",
        port: r.port ?? "",
      })),
    );
    setStep(2);
  }

  function manual() {
    setRows([{ key: newKey(), container_no: "", bl_no: "", weight_kg: "", port: "" }]);
    setStep(2);
  }

  const counts = new Map<string, number>();
  rows.forEach((r) => {
    const c = normalizeContainerNo(r.container_no);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  });
  const rowWarnings = (r: Row): (ParseWarning | "exists")[] => {
    const c = normalizeContainerNo(r.container_no);
    if (!c) return [];
    const w: (ParseWarning | "exists")[] = [];
    if (!isValidContainerNo(c)) w.push("check-digit");
    if ((counts.get(c) ?? 0) > 1) w.push("duplicate");
    if (existing.has(c)) w.push("exists");
    return w;
  };

  const validRows = rows.filter((r) => normalizeContainerNo(r.container_no));
  const hasDup = rows.some((r) => rowWarnings(r).includes("duplicate"));
  const canSave = validRows.length > 0 && !!planDate && !!destination && !!jobType && !hasDup && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const jobs: NewJobInput[] = validRows.map((r) => {
        const w = r.weight_kg.replace(/,/g, "").trim();
        return {
          plan_date: planDate,
          container_no: normalizeContainerNo(r.container_no),
          bl_no: (r.bl_no.trim() || bl.trim() || null)?.toUpperCase() ?? null,
          weight_doc_kg: w ? Number(w) : null,
          port: r.port.trim() || port.trim() || null,
          destination,
          job_type: jobType,
          customer: customer.trim() || null,
          shipping: shipping.trim() || null,
          return_due_date: returnDue || null,
        };
      });
      await onSave(
        { plan_date: planDate, customer: customer.trim() || null, shipping: shipping.trim() || null, source_text: text || null },
        jobs,
        { autoAssign },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="นำเข้าแพลนลากตู้"
      subtitle={step === 1 ? "ขั้นที่ 1/2 · วางรายการตู้จาก partner" : "ขั้นที่ 2/2 · ตรวจสอบและกรอกข้อมูลแพลน"}
      footer={
        step === 1 ? (
          <>
            <button type="button" className={button("ghost")} onClick={manual}>
              กรอกเอง
            </button>
            <button type="button" className={button("primary")} disabled={parsed.length === 0} onClick={goReview}>
              ถัดไป: ตรวจสอบ {parsed.length > 0 ? `${parsed.length} ตู้` : ""}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={button("ghost", "md", "mr-auto")} onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" aria-hidden />
              กลับไปวางข้อความ
            </button>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={autoAssign} onChange={(e) => setAutoAssign(e.target.checked)} className="size-4 accent-blue-800" />
              จัดรถอัตโนมัติหลังบันทึก
            </label>
            <button type="button" className={button("primary")} disabled={!canSave} onClick={save}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              บันทึก {validRows.length} ตู้
            </button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            <label htmlFor="plan-text" className={label}>
              วางข้อความ / ตารางจาก Excel หรือ LINE
            </label>
            <textarea
              id="plan-text"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={EXAMPLE}
              rows={14}
              className={clsx(input, "font-mono text-sm leading-relaxed")}
            />
          </div>
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <p className="mb-2 text-sm font-medium">อ่านได้ {parsed.length} ตู้</p>
            {parsed.length === 0 ? (
              <p className="text-sm text-slate-500">ระบบจะหาเลขตู้ (เช่น ABCU1234567) ในข้อความให้อัตโนมัติ พร้อม BL น้ำหนัก และท่า</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {parsed.map((r, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-mono font-medium">{r.container_no}</span>
                    {r.weight_kg !== null && <span className="text-slate-500">{(r.weight_kg / 1000).toFixed(1)}t</span>}
                    {r.port && <span className="text-slate-500">{r.port}</span>}
                    {r.warnings.length > 0 && <AlertTriangle className="size-4 text-amber-600" aria-label="ตรวจสอบ" />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="sr-only">ข้อมูลแพลน</legend>
            <Field id="f-date" label="วันที่แพลน *">
              <input id="f-date" type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} className={input} required />
            </Field>
            <Field id="f-dest" label="ปลายทาง *">
              <select id="f-dest" value={destination} onChange={(e) => setDestination(e.target.value)} className={input} required>
                <option value="">เลือกปลายทาง</option>
                {destinations.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field id="f-type" label="ประเภทงาน *">
              <select id="f-type" value={jobType} onChange={(e) => setJobType(e.target.value)} className={input} required>
                <option value="">เลือกประเภทงาน</option>
                {jobTypes.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field id="f-return" label="วันที่ต้องคืนตู้">
              <input id="f-return" type="date" value={returnDue} min={planDate} onChange={(e) => setReturnDue(e.target.value)} className={input} />
              <span className="mt-1 flex gap-1">
                {[2, 3, 4].map((n) => (
                  <button key={n} type="button" onClick={() => setReturnDue(addDays(planDate, n))} className="cursor-pointer rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200">
                    +{n} วัน
                  </button>
                ))}
              </span>
            </Field>
            <Field id="f-customer" label="ลูกค้า (Customer)">
              <input id="f-customer" list="dl-customers" value={customer} onChange={(e) => setCustomer(e.target.value)} className={input} />
              <datalist id="dl-customers">
                {recentCustomers.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field id="f-ship" label="ชิปปิ้ง">
              <input id="f-ship" list="dl-ship" value={shipping} onChange={(e) => setShipping(e.target.value)} className={input} />
              <datalist id="dl-ship">
                {recentShipping.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field id="f-bl" label="BL (ใช้กับแถวที่ว่าง)">
              <input id="f-bl" value={bl} onChange={(e) => setBl(e.target.value)} className={clsx(input, "uppercase")} />
            </Field>
            <Field id="f-port" label="ท่า (ใช้กับแถวที่ว่าง)">
              <input id="f-port" list="dl-ports" value={port} onChange={(e) => setPort(e.target.value.toUpperCase())} className={input} />
              <datalist id="dl-ports">
                {ports.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </fieldset>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">รายการตู้ ({validRows.length})</p>
              <button
                type="button"
                className={button("ghost", "sm")}
                onClick={() => setRows((rs) => [...rs, { key: newKey(), container_no: "", bl_no: "", weight_kg: "", port: "" }])}
              >
                <Plus className="size-4" aria-hidden />
                เพิ่มแถว
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="w-8 px-2 py-2">#</th>
                    <th className="px-2 py-2">เลขตู้ *</th>
                    <th className="px-2 py-2">BL</th>
                    <th className="px-2 py-2">น้ำหนัก (กก.)</th>
                    <th className="px-2 py-2">ท่า</th>
                    <th className="px-2 py-2">ตรวจสอบ</th>
                    <th className="w-10 px-2 py-2">
                      <span className="sr-only">ลบ</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const w = rowWarnings(r);
                    const ex = existing.get(normalizeContainerNo(r.container_no));
                    return (
                      <tr key={r.key} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-xs text-slate-400">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          <input
                            value={r.container_no}
                            onChange={(e) => setRow(r.key, { container_no: e.target.value.toUpperCase() })}
                            aria-label={`เลขตู้ แถว ${i + 1}`}
                            className={clsx(input, "h-9 font-mono", w.includes("duplicate") && "ring-rose-400")}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={r.bl_no} placeholder={bl} onChange={(e) => setRow(r.key, { bl_no: e.target.value.toUpperCase() })} aria-label={`BL แถว ${i + 1}`} className={clsx(input, "h-9")} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={r.weight_kg} inputMode="decimal" onChange={(e) => setRow(r.key, { weight_kg: e.target.value })} aria-label={`น้ำหนัก แถว ${i + 1}`} className={clsx(input, "h-9 w-28 text-right tabular-nums")} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={r.port} placeholder={port} list="dl-ports" onChange={(e) => setRow(r.key, { port: e.target.value.toUpperCase() })} aria-label={`ท่า แถว ${i + 1}`} className={clsx(input, "h-9 w-24")} />
                        </td>
                        <td className="px-2 py-1.5 text-xs">
                          {w.includes("duplicate") && <p className="font-medium text-rose-700">ซ้ำในรายการ</p>}
                          {w.includes("exists") && ex && <p className="text-rose-700">มีงานค้างอยู่ (แพลน {formatThaiDate(ex.plan_date)})</p>}
                          {w.includes("check-digit") && <p className="text-amber-700">เลขตู้อาจพิมพ์ผิด</p>}
                          {w.length === 0 && normalizeContainerNo(r.container_no) && <p className="text-emerald-700">ถูกต้อง</p>}
                        </td>
                        <td className="px-2 py-1.5">
                          <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`ลบแถว ${i + 1}`} className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700">
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {(!destination || !jobType) && <p className="text-sm text-slate-500">เลือกปลายทางและประเภทงานก่อนบันทึก</p>}
          {hasDup && <p className="text-sm text-rose-700">มีเลขตู้ซ้ำในรายการ ลบแถวที่ซ้ำก่อนบันทึก</p>}
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function Field({ id, label: text, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {children}
    </div>
  );
}
