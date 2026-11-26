"use client";

import type { Driver, Lookup, Rate } from "./types";
import { supabaseBrowser } from "./supabase/client";

/** อ่าน/เขียนข้อมูลหน้าตั้งค่า — สิทธิ์บังคับที่ฐานข้อมูล (RLS) ตามบทบาท */

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** แก้/ลบที่ RLS ไม่อนุญาตจะสำเร็จแบบเงียบ (0 แถว) — เลือกแถวกลับมาแล้วเช็กเอง */
function failIfNone(what: string, res: { error: { message: string } | null; data: unknown[] | null }) {
  fail(what, res.error);
  if (!res.data?.length) throw new Error(`${what}ไม่สำเร็จ: ไม่มีสิทธิ์ หรือข้อมูลถูกลบไปแล้ว`);
}

export async function loadLookups(): Promise<Lookup[]> {
  const res = await supabaseBrowser().from("lookups").select("kind,value,sort").order("kind").order("sort").order("value");
  fail("โหลดตัวเลือก", res.error);
  return res.data as Lookup[];
}

/** เพิ่ม (oldValue ว่าง) หรือแก้ชื่อตัวเลือก — งานเดิมเก็บเป็นข้อความ จึงไม่เปลี่ยนตาม */
export async function saveLookup(kind: Lookup["kind"], value: string, sort: number, oldValue?: string): Promise<void> {
  const sb = supabaseBrowser();
  const res = oldValue
    ? await sb.from("lookups").update({ value: value.trim(), sort }).eq("kind", kind).eq("value", oldValue).select("kind")
    : await sb.from("lookups").insert({ kind, value: value.trim(), sort }).select("kind");
  failIfNone("บันทึกตัวเลือก", res);
}

export async function deleteLookup(kind: Lookup["kind"], value: string): Promise<void> {
  const res = await supabaseBrowser().from("lookups").delete().eq("kind", kind).eq("value", value).select("kind");
  failIfNone("ลบตัวเลือก", res);
}

export async function loadRates(): Promise<Rate[]> {
  const res = await supabaseBrowser().from("rates").select("id,destination,truck_type,max_tons,price").order("destination").order("truck_type");
  fail("โหลดอัตราค่าขนส่ง", res.error);
  return (res.data as Rate[]).map((r) => ({ ...r, price: Number(r.price), max_tons: r.max_tons === null ? null : Number(r.max_tons) }));
}

export async function saveRate(r: Omit<Rate, "id"> & { id?: string }): Promise<void> {
  const sb = supabaseBrowser();
  const { id, ...row } = r;
  const res = id ? await sb.from("rates").update(row).eq("id", id).select("id") : await sb.from("rates").insert(row).select("id");
  failIfNone("บันทึกอัตรา", res);
}

export async function deleteRate(id: string): Promise<void> {
  const res = await supabaseBrowser().from("rates").delete().eq("id", id).select("id");
  failIfNone("ลบอัตรา", res);
}

export async function loadDrivers(): Promise<Driver[]> {
  const res = await supabaseBrowser().from("drivers").select("*").order("id");
  fail("โหลดคนขับ", res.error);
  return res.data as Driver[];
}

export type DriverPatch = Partial<Omit<Driver, "id">>;

export async function updateDriver(id: string, patch: DriverPatch): Promise<void> {
  const res = await supabaseBrowser()
    .from("drivers")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  failIfNone("บันทึกคนขับ", res);
}
