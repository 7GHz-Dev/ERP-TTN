"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Driver, TruckType, Unavailability } from "@/lib/types";
import { formatThaiDate } from "@/lib/logic/dates";
import { Modal } from "@/components/ui/Modal";
import { button, input, label } from "@/components/ui/styles";

const JOB_CLASSES = ["เบา", "เบาและหนัก", "หนัก", "กะบะตู้ทึบ"];
const BANKS = ["กสิกรไทย", "ไทยพาณิชย์", "กรุงเทพ", "กรุงไทย", "กรุงศรีอยุธยา", "ทหารไทยธนชาต", "ออมสิน", "ธ.ก.ส."];
const LEAVE_NOTES = ["ลา", "ติดธุระส่วนตัว", "ซ่อมรถ", "รับงานนอก", "ไปต่างจังหวัด"];

export type DriverInput = Omit<Driver, "id" | "active" | "peak_code" | "doc_note"> & { active?: boolean };

/** เพิ่มคนขับ (ไม่ส่ง driver) หรือแก้ไขคนขับเดิม */
export function AddDriverDialog({
  open,
  onClose,
  fleets,
  onSave,
  driver,
}: {
  open: boolean;
  onClose: () => void;
  fleets: string[];
  onSave: (d: DriverInput) => Promise<void>;
  driver?: Driver;
}) {
  const s = (v: string | null | undefined) => v ?? "";
  const initial = driver
    ? { name: driver.name, truck_no: s(driver.truck_no), phone: s(driver.phone), truck_type: driver.truck_type, fleet: s(driver.fleet), job_class: s(driver.job_class), bank: s(driver.bank), account_name: s(driver.account_name), account_no: s(driver.account_no), active: driver.active }
    : { name: "", truck_no: "", phone: "", truck_type: "partner" as TruckType, fleet: "", job_class: "เบาและหนัก", bank: "", account_name: "", account_no: "", active: true };
  const [f, setF] = useState(initial);
  const classes = f.job_class && !JOB_CLASSES.includes(f.job_class) ? [f.job_class, ...JOB_CLASSES] : JOB_CLASSES;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: Exclude<keyof typeof f, "active">) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // ข้อมูลเดิมจากการนำเข้าบางคนไม่มีทะเบียน — บังคับเฉพาะตอนเพิ่มใหม่
    if (!f.name.trim() || (!driver && !f.truck_no.trim())) return setError(driver ? "กรอกชื่อ" : "กรอกชื่อและทะเบียนรถ");
    setBusy(true);
    setError(null);
    try {
      const t = (s: string) => s.trim() || null;
      await onSave({
        name: f.name.trim(),
        truck_no: t(f.truck_no),
        phone: t(f.phone),
        truck_type: f.truck_type,
        fleet: t(f.fleet),
        job_class: t(f.job_class),
        bank: t(f.bank),
        account_name: t(f.account_name) ?? f.name.trim(),
        account_no: t(f.account_no),
        ...(driver ? { active: f.active } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={driver ? `แก้ไขคนขับ · ${driver.id}` : "เพิ่มคนขับ / รถร่วม"}
      footer={
        <>
          <button type="button" className={button("secondary")} onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" form="add-driver" className={button("primary")} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {driver ? "บันทึก" : "เพิ่มคนขับ"}
          </button>
        </>
      }
    >
      <form id="add-driver" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <F id="ad-name" l="ชื่อ-นามสกุล *">
          <input id="ad-name" autoFocus value={f.name} onChange={set("name")} className={input} required />
        </F>
        <F id="ad-truck" l="ทะเบียนรถ (หัว - หาง) *">
          <input id="ad-truck" value={f.truck_no} onChange={set("truck_no")} placeholder="70-1234 ตาก - 70-1235 ตาก" className={input} required={!driver} />
        </F>
        <F id="ad-phone" l="เบอร์โทร">
          <input id="ad-phone" type="tel" value={f.phone} onChange={set("phone")} className={input} />
        </F>
        <F id="ad-type" l="ประเภทรถ">
          <select id="ad-type" value={f.truck_type} onChange={set("truck_type")} className={input}>
            <option value="partner">รถร่วม (รถนอก)</option>
            <option value="company">รถบริษัท</option>
          </select>
        </F>
        <F id="ad-fleet" l="สังกัด / เจ้าของรถ">
          <input id="ad-fleet" list="ad-fleets" value={f.fleet} onChange={set("fleet")} className={input} />
          <datalist id="ad-fleets">
            {fleets.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </F>
        <F id="ad-class" l="ประเภทที่รับงาน">
          <select id="ad-class" value={f.job_class} onChange={set("job_class")} className={input}>
            {classes.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </F>
        <F id="ad-bank" l="ธนาคาร">
          <input id="ad-bank" list="ad-banks" value={f.bank} onChange={set("bank")} className={input} />
          <datalist id="ad-banks">
            {BANKS.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </F>
        <F id="ad-accno" l="เลขที่บัญชี">
          <input id="ad-accno" inputMode="numeric" value={f.account_no} onChange={set("account_no")} className={input} />
        </F>
        <F id="ad-accname" l="ชื่อบัญชี (ว่าง = ชื่อคนขับ)" wide>
          <input id="ad-accname" value={f.account_name} onChange={set("account_name")} placeholder={f.name} className={input} />
        </F>
        {driver && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="size-4 accent-blue-800" />
            ใช้งานอยู่ (ไม่ติ๊ก = ไม่แสดงให้จัดรถ)
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function LeaveDialog({
  driver,
  date,
  leaves,
  onClose,
  onSave,
  onDelete,
}: {
  driver: Driver;
  date: string;
  leaves: Unavailability[];
  onClose: () => void;
  onSave: (u: Omit<Unavailability, "id">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [start, setStart] = useState(date);
  const [end, setEnd] = useState(date);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = leaves.filter((l) => l.driver_id === driver.id).sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (end && start && end < start) return setError("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
    setBusy(true);
    try {
      await onSave({ driver_id: driver.id, start_date: start || null, end_date: end || null, note: note.trim() || null });
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
      title="แจ้งวันไม่ว่าง"
      subtitle={`${driver.name} · ${driver.truck_no ?? ""}`}
      footer={
        <>
          <button type="button" className={button("secondary")} onClick={onClose}>
            ปิด
          </button>
          <button type="submit" form="leave-form" className={button("primary")} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            บันทึก
          </button>
        </>
      }
    >
      <form id="leave-form" onSubmit={save} className="grid grid-cols-2 gap-3">
        <F id="lv-start" l="ตั้งแต่">
          <input id="lv-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={input} required />
        </F>
        <F id="lv-end" l="ถึง (ว่าง = ไม่มีกำหนด)">
          <input id="lv-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={input} />
        </F>
        <F id="lv-note" l="เหตุผล" wide>
          <input id="lv-note" list="lv-notes" value={note} onChange={(e) => setNote(e.target.value)} className={input} />
          <datalist id="lv-notes">
            {LEAVE_NOTES.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          <span className="mt-1.5 flex flex-wrap gap-1">
            {LEAVE_NOTES.map((x) => (
              <button key={x} type="button" onClick={() => setNote(x)} className="cursor-pointer rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200">
                {x}
              </button>
            ))}
          </span>
        </F>
        {error && (
          <p role="alert" className="col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
      </form>
      {mine.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-sm font-medium">วันไม่ว่างที่บันทึกไว้</p>
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {mine.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1">
                  {formatThaiDate(l.start_date ?? l.end_date)} – {l.end_date ? formatThaiDate(l.end_date) : "ไม่มีกำหนด"}
                  {l.note && <span className="text-slate-500"> · {l.note}</span>}
                </span>
                <button type="button" onClick={() => onDelete(l.id)} aria-label="ลบ" className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function F({ id, l, wide, children }: { id: string; l: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "col-span-full" : undefined}>
      <label htmlFor={id} className={label}>
        {l}
      </label>
      {children}
    </div>
  );
}
