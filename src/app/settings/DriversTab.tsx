"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Search, UserPlus } from "lucide-react";
import clsx from "clsx";
import { button, input } from "@/components/ui/styles";
import type { Driver } from "@/lib/types";
import { loadDrivers, updateDriver } from "@/lib/settings-data";
import { addDriver } from "@/lib/data";
import { AddDriverDialog, type DriverInput } from "@/components/board/DriverForms";
import { TruckBadge } from "@/components/board/ui";

type Show = "active" | "inactive" | "all";

export function DriversTab({ canAdd }: { canAdd: boolean }) {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("active");
  const [editing, setEditing] = useState<Driver | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    try {
      setDrivers(await loadDrivers());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  // โหลดครั้งแรก (setState อยู่ใน callback ของ promise ไม่ใช่ในตัว effect)
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  const fleets = useMemo(() => [...new Set((drivers ?? []).map((d) => d.fleet).filter((x): x is string => !!x))].sort(), [drivers]);
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  const list = (drivers ?? []).filter(
    (d) =>
      (show === "all" || d.active === (show === "active")) &&
      (!q || [d.id, d.name, d.truck_no, d.phone, d.fleet].some((v) => (v ?? "").toLowerCase().replace(/\s+/g, "").includes(q))),
  );

  if (!drivers)
    return error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : <Loader2 className="size-5 animate-spin text-slate-500" aria-label="กำลังโหลด" />;

  const count = (s: Show) => drivers.filter((d) => s === "all" || d.active === (s === "active")).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ ทะเบียน เบอร์ สังกัด" aria-label="ค้นหาคนขับ" className={clsx(input, "h-9 py-1.5 pl-9")} />
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm" role="group" aria-label="แสดง">
          {(
            [
              ["active", "ใช้งาน"],
              ["inactive", "ปิดใช้งาน"],
              ["all", "ทั้งหมด"],
            ] as [Show, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={show === k}
              onClick={() => setShow(k)}
              className={clsx("rounded-md px-2.5 py-1", show === k ? "bg-white font-medium shadow-sm" : "text-slate-600")}
            >
              {l} <span className="tabular-nums text-slate-500">{count(k)}</span>
            </button>
          ))}
        </div>
        {canAdd && (
          <button type="button" className={button("primary", "md")} onClick={() => setAdding(true)}>
            <UserPlus className="size-4" aria-hidden />
            เพิ่มคนขับ
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
              <th className="px-3 py-2">รหัส</th>
              <th className="px-3 py-2">ชื่อ</th>
              <th className="px-3 py-2">ทะเบียนรถ</th>
              <th className="px-3 py-2">เบอร์โทร</th>
              <th className="px-3 py-2">ประเภทงาน</th>
              <th className="px-3 py-2">สังกัด</th>
              <th className="px-3 py-2">
                <span className="sr-only">แก้ไข</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id} className={clsx("border-b border-slate-100", !d.active && "text-slate-400")}>
                <td className="px-3 py-2 font-mono text-xs">{d.id}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">{d.name}</span>
                    <TruckBadge type={d.truck_type} />
                    {!d.active && <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">ปิดใช้งาน</span>}
                  </span>
                </td>
                <td className="px-3 py-2">{d.truck_no ?? "–"}</td>
                <td className="whitespace-nowrap px-3 py-2">{d.phone ?? "–"}</td>
                <td className="px-3 py-2">{d.job_class ?? "–"}</td>
                <td className="px-3 py-2">{d.fleet ?? "–"}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" className={button("ghost", "sm")} onClick={() => setEditing(d)} aria-label={`แก้ไข ${d.name}`}>
                    <Pencil className="size-4" aria-hidden />
                    แก้ไข
                  </button>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  ไม่พบคนขับ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <AddDriverDialog
          key={editing.id}
          open
          driver={editing}
          fleets={fleets}
          onClose={() => setEditing(null)}
          onSave={async (d: DriverInput) => {
            await updateDriver(editing.id, d);
            await reload();
            setNotice(`บันทึก ${d.name} แล้ว`);
          }}
        />
      )}
      {adding && (
        <AddDriverDialog
          open
          fleets={fleets}
          onClose={() => setAdding(false)}
          onSave={async (d: DriverInput) => {
            const created = await addDriver(d);
            await reload();
            setNotice(`เพิ่ม ${created.name} (${created.id}) แล้ว`);
          }}
        />
      )}
    </div>
  );
}
