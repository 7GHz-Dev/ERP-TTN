"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { button, input, label } from "@/components/ui/styles";
import type { Lookup, Rate } from "@/lib/types";
import { deleteRate, loadLookups, loadRates, saveRate } from "@/lib/settings-data";
import { rateError } from "@/lib/logic/settings";

const TRUCK_LABEL: Record<Rate["truck_type"], string> = { company: "รถบริษัท", partner: "รถร่วม", any: "ทุกประเภท" };
const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

type Draft = { id?: string; destination: string; truck_type: Rate["truck_type"]; max_tons: string; price: string };

export function RatesTab() {
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [r, l] = await Promise.all([loadRates(), loadLookups()]);
      setRates(r);
      setDestinations(l.filter((x: Lookup) => x.kind === "destination").map((x) => x.value));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  // โหลดครั้งแรก (setState อยู่ใน callback ของ promise ไม่ใช่ในตัว effect)
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  const remove = async (r: Rate) => {
    if (!window.confirm(`ลบอัตรา ${r.destination} / ${TRUCK_LABEL[r.truck_type]}?`)) return;
    setBusy(true);
    try {
      await deleteRate(r.id);
      await reload();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!rates)
    return error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : <Loader2 className="size-5 animate-spin text-slate-500" aria-label="กำลังโหลด" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-slate-600">ระบบใช้แนะนำค่าเที่ยวตามปลายทาง + ประเภทรถ (+ น้ำหนักสูงสุด ถ้ากำหนด) · แก้ราคาในแต่ละตู้ได้เสมอ</p>
        <button type="button" className={button("primary", "md")} onClick={() => setDraft({ destination: "", truck_type: "partner", max_tons: "", price: "" })}>
          <Plus className="size-4" aria-hidden />
          เพิ่มอัตรา
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
              <th className="px-3 py-2">ปลายทาง</th>
              <th className="px-3 py-2">ประเภทรถ</th>
              <th className="px-3 py-2 text-right">น้ำหนักสูงสุด (ตัน)</th>
              <th className="px-3 py-2 text-right">ค่าเที่ยว (บาท)</th>
              <th className="px-3 py-2">
                <span className="sr-only">จัดการ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="px-3 py-2">{r.destination}</td>
                <td className="px-3 py-2">{TRUCK_LABEL[r.truck_type]}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.max_tons === null ? "ไม่จำกัด" : r.max_tons}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{baht(r.price)}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      className={button("ghost", "sm")}
                      aria-label={`แก้ไข ${r.destination}`}
                      onClick={() =>
                        setDraft({ id: r.id, destination: r.destination, truck_type: r.truck_type, max_tons: r.max_tons?.toString() ?? "", price: r.price.toString() })
                      }
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button type="button" disabled={busy} className={button("ghost", "sm", "text-rose-700 hover:bg-rose-50")} aria-label={`ลบ ${r.destination}`} onClick={() => remove(r)}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rates.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  ยังไม่มีอัตรา
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {draft && <RateDialog key={draft.id ?? "new"} draft={draft} destinations={destinations} onClose={() => setDraft(null)} onSaved={reload} />}
    </div>
  );
}

function RateDialog({ draft, destinations, onClose, onSaved }: { draft: Draft; destinations: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const row = {
      id: d.id,
      destination: d.destination.trim(),
      truck_type: d.truck_type,
      max_tons: d.max_tons.trim() === "" ? null : Number(d.max_tons.replace(/,/g, "")),
      price: Number(d.price.replace(/,/g, "")),
    };
    const bad = rateError(row);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      await saveRate(row);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={d.id ? "แก้ไขอัตรา" : "เพิ่มอัตรา"}
      footer={
        <>
          <button type="button" className={button("secondary")} onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" form="rate-form" disabled={busy} className={button("primary")}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            บันทึก
          </button>
        </>
      }
    >
      <form id="rate-form" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="rt-dest" className={label}>
            ปลายทาง
          </label>
          <input id="rt-dest" list="rt-dests" required value={d.destination} onChange={set("destination")} className={input} />
          <datalist id="rt-dests">
            {destinations.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="rt-type" className={label}>
            ประเภทรถ
          </label>
          <select id="rt-type" value={d.truck_type} onChange={set("truck_type")} className={input}>
            {(Object.keys(TRUCK_LABEL) as Rate["truck_type"][]).map((t) => (
              <option key={t} value={t}>
                {TRUCK_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rt-tons" className={label}>
              น้ำหนักสูงสุด (ตัน)
            </label>
            <input id="rt-tons" inputMode="decimal" placeholder="ไม่จำกัด" value={d.max_tons} onChange={set("max_tons")} className={input} />
          </div>
          <div>
            <label htmlFor="rt-price" className={label}>
              ค่าเที่ยว (บาท)
            </label>
            <input id="rt-price" inputMode="decimal" required value={d.price} onChange={set("price")} className={input} />
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
