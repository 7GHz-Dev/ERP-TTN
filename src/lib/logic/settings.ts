import type { Lookup } from "../types";

/** ตรวจค่าตัวเลือกก่อนบันทึก — `current` = ค่าเดิมตอนแก้ไข */
export function lookupError(all: Lookup[], kind: Lookup["kind"], value: string, current?: string): string | null {
  const v = value.trim();
  if (!v) return "กรอกค่า";
  if (v !== current && all.some((l) => l.kind === kind && l.value === v)) return `มี ${v} อยู่แล้ว`;
  return null;
}

export function rateError(r: { destination: string; price: number; max_tons: number | null }): string | null {
  if (!r.destination.trim()) return "กรอกปลายทาง";
  if (!(r.price > 0)) return "ราคาต้องมากกว่า 0";
  if (r.max_tons !== null && !(r.max_tons > 0)) return "น้ำหนักสูงสุดต้องมากกว่า 0";
  return null;
}
