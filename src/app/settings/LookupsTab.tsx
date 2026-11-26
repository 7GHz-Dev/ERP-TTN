"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { button, input } from "@/components/ui/styles";
import type { Lookup } from "@/lib/types";
import { deleteLookup, loadLookups, saveLookup } from "@/lib/settings-data";
import { lookupError } from "@/lib/logic/settings";

const KINDS: { kind: Lookup["kind"]; label: string; hint: string }[] = [
  { kind: "destination", label: "ปลายทาง", hint: "ใช้กับอัตราค่าขนส่งและฟอร์มนำเข้าแพลน" },
  { kind: "port", label: "ท่า / ต้นทางปล่อยตู้", hint: "เช่น B2, C1C2" },
  { kind: "job_type", label: "ประเภทงาน", hint: "เช่น MSFZ - รถยนต์เก่า" },
  { kind: "shipping", label: "ชิปปิ้ง", hint: "บริษัทชิปปิ้งที่ส่งแพลน" },
];

export function LookupsTab() {
  const [all, setAll] = useState<Lookup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setAll(await loadLookups());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  // โหลดครั้งแรก (setState อยู่ใน callback ของ promise ไม่ใช่ในตัว effect)
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  /** คืนข้อความผิดพลาด หรือ null ถ้าสำเร็จ */
  const run = async (fn: () => Promise<void>): Promise<string | null> => {
    try {
      await fn();
      await reload();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  if (!all) return error ? <Alert text={error} /> : <Loader2 className="size-5 animate-spin text-slate-500" aria-label="กำลังโหลด" />;

  return (
    <div className="space-y-4">
      {error && <Alert text={error} />}
      <p className="text-sm text-slate-600">ตัวเลือกที่แสดงในฟอร์มนำเข้าแพลนและฟอร์มแก้ไขตู้ · แก้ชื่อแล้วงานเดิมยังเก็บชื่อเดิม</p>
      <div className="grid gap-4 md:grid-cols-2">
        {KINDS.map((k) => (
          <KindCard key={k.kind} {...k} all={all} items={all.filter((l) => l.kind === k.kind)} run={run} />
        ))}
      </div>
    </div>
  );
}

function Alert({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
      {text}
    </p>
  );
}

function KindCard({
  kind,
  label,
  hint,
  all,
  items,
  run,
}: {
  kind: Lookup["kind"];
  label: string;
  hint: string;
  all: Lookup[];
  items: Lookup[];
  run: (fn: () => Promise<void>) => Promise<string | null>;
}) {
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    const e = await run(fn);
    setBusy(false);
    setError(e);
    if (!e) after?.();
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = lookupError(all, kind, value);
    if (bad) return setError(bad);
    const sort = Math.max(0, ...items.map((i) => i.sort)) + 1;
    act(() => saveLookup(kind, value, sort), () => setValue(""));
  };

  const rename = (item: Lookup) => {
    const bad = lookupError(all, kind, editValue, item.value);
    if (bad) return setError(bad);
    if (editValue.trim() === item.value) return setEditing(null);
    act(() => saveLookup(kind, editValue, item.sort, item.value), () => setEditing(null));
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="font-semibold">
        {label} <span className="text-sm font-normal text-slate-500">({items.length})</span>
      </h2>
      <p className="mb-3 text-xs text-slate-500">{hint}</p>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.value} className="flex items-center gap-2 py-1.5">
            {editing === item.value ? (
              <>
                <input
                  autoFocus
                  aria-label={`ชื่อใหม่ของ ${item.value}`}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(item);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className={clsx(input, "h-8 py-1")}
                />
                <button type="button" disabled={busy} onClick={() => rename(item)} className={button("primary", "sm")} aria-label="บันทึก">
                  <Check className="size-4" aria-hidden />
                </button>
                <button type="button" onClick={() => setEditing(null)} className={button("ghost", "sm")} aria-label="ยกเลิก">
                  <X className="size-4" aria-hidden />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-sm">{item.value}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(item.value);
                    setEditValue(item.value);
                    setError(null);
                  }}
                  className={button("ghost", "sm")}
                  aria-label={`แก้ไข ${item.value}`}
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => window.confirm(`ลบ "${item.value}" ออกจาก${label}?`) && act(() => deleteLookup(kind, item.value))}
                  className={button("ghost", "sm", "text-rose-700 hover:bg-rose-50")}
                  aria-label={`ลบ ${item.value}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </>
            )}
          </li>
        ))}
        {!items.length && <li className="py-2 text-sm text-slate-500">ยังไม่มี</li>}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input aria-label={`เพิ่ม${label}`} placeholder={`เพิ่ม${label}`} value={value} onChange={(e) => setValue(e.target.value)} className={clsx(input, "h-9 py-1")} />
        <button type="submit" disabled={busy} className={button("secondary", "md", "h-9")}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          เพิ่ม
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
