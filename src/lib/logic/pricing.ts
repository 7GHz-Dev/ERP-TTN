import type { Job, Rate, TruckType } from "../types";

/**
 * ราคาแนะนำ: ปลายทางตรงกัน + ประเภทรถตรงกัน (ถ้าไม่มีใช้ 'any')
 * แล้วเลือกขั้นน้ำหนักแรกที่ max_tons >= น้ำหนัก (null = ไม่จำกัด)
 */
export function suggestPrice(
  rates: Rate[],
  q: { destination: string | null; truckType: TruckType; weightKg: number | null },
): number | null {
  if (!q.destination) return null;
  const tons = (q.weightKg ?? 0) / 1000;
  const forDest = rates.filter((r) => r.destination.trim() === q.destination!.trim());
  const exact = forDest.filter((r) => r.truck_type === q.truckType);
  const pool = exact.length ? exact : forDest.filter((r) => r.truck_type === "any");
  const tiers = [...pool].sort((a, b) => (a.max_tons ?? Infinity) - (b.max_tons ?? Infinity));
  const hit = tiers.find((r) => r.max_tons === null || tons <= Number(r.max_tons));
  return hit ? Number(hit.price) : null;
}

const n = (v: number | null | undefined) => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface Money {
  gross: number;
  whTax: number;
  net: number;
}

/**
 * ยอดชำระครั้งที่ 1 (ตามสูตรเดิมใน WorkLog)
 * รวม = ค่าเที่ยว + น้ำหนักเกิน + ค้างคืน + อื่น ๆ
 * WH Tax = 1% ของ (ค่าเที่ยว + น้ำหนักเกิน + ค้างคืน) เฉพาะรถร่วม, รถบริษัท = 0
 */
export function computeMoney(
  j: Pick<Job, "price" | "overweight_fee" | "overnight_fee" | "other_fee" | "wh_tax">,
  truckType: TruckType | null,
): Money {
  const base = n(j.price) + n(j.overweight_fee) + n(j.overnight_fee);
  const gross = round2(base + n(j.other_fee));
  const whTax = j.wh_tax !== null && j.wh_tax !== undefined ? n(j.wh_tax) : truckType === "partner" ? round2(base * 0.01) : 0;
  return { gross, whTax, net: round2(gross - whTax) };
}

export function formatBaht(v: number | null | undefined, opts: { blank?: string } = {}): string {
  if (v === null || v === undefined || Number.isNaN(v)) return opts.blank ?? "";
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
