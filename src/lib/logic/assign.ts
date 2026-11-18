import type { Driver, Job, JobPatch, Rate, Unavailability } from "../types";
import { suggestPrice } from "./pricing";
import { driverDayStatus, type DriverDayStatus } from "./availability";
import { jobWeightKg } from "./status";

export const DEFAULT_HEAVY_TONS = 20;

interface Ctx {
  date: string;
  drivers: Driver[];
  allJobs: Job[];
  leaves: Unavailability[];
  /** driver_id -> วันที่มีงานล่าสุด (ISO) */
  lastJobDate: Map<string, string | null>;
}

export function isHeavy(j: Job, heavyTons = DEFAULT_HEAVY_TONS): boolean {
  const kg = jobWeightKg(j);
  return kg !== null && kg >= heavyTons * 1000;
}

/** คนขับรับตู้หนักได้ไหม (ไม่ระบุประเภท = รับได้) */
export function acceptsHeavy(d: Driver): boolean {
  const c = (d.job_class ?? "").trim();
  return c === "" || c.includes("หนัก");
}

/** กะบะตู้ทึบ ไม่ใช่รถลากตู้ ไม่ใช้ในการจัดอัตโนมัติ */
export function canHaulContainer(d: Driver): boolean {
  return !(d.job_class ?? "").includes("กะบะ");
}

/** คิว: รถบริษัทก่อน แล้วรถร่วม, ในกลุ่มเดียวกันใครว่างนานที่สุดได้ก่อน (ไม่มีประวัติไว้ท้าย) */
function queueCompare(a: Driver, b: Driver, last: Map<string, string | null>): number {
  if (a.truck_type !== b.truck_type) return a.truck_type === "company" ? -1 : 1;
  const la = last.get(a.id) ?? null;
  const lb = last.get(b.id) ?? null;
  if (la !== lb) {
    if (la === null) return 1;
    if (lb === null) return -1;
    return la < lb ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

export interface RankedDriver {
  driver: Driver;
  status: DriverDayStatus;
}

const STATE_ORDER = { free: 0, busy: 1, running: 2, off: 3 } as const;

/** เรียงคนขับสำหรับหน้าต่างเลือกคนขับ */
export function rankDrivers(ctx: Ctx & { excludeJobId?: string }): RankedDriver[] {
  return ctx.drivers
    .map((driver) => ({
      driver,
      status: driverDayStatus(driver, ctx.date, ctx.allJobs, ctx.leaves, ctx.excludeJobId),
    }))
    .sort((a, b) => {
      const s = STATE_ORDER[a.status.state] - STATE_ORDER[b.status.state];
      return s !== 0 ? s : queueCompare(a.driver, b.driver, ctx.lastJobDate);
    });
}

export interface AutoAssignResult {
  assignments: { jobId: string; driverId: string }[];
  /** จำนวนตู้ที่ยังหาคนขับไม่ได้ (ต้องหารถร่วมเพิ่ม) */
  shortage: number;
}

/**
 * จัดรถอัตโนมัติให้ตู้ที่ยังไม่มีคนขับ
 * ตู้หนักจัดก่อน (คนขับที่รับตู้หนักได้มีน้อยกว่า) แล้วค่อยจัดตู้เบา
 */
export function autoAssign(ctx: Ctx & { targets: Job[]; heavyTons?: number }): AutoAssignResult {
  const heavyTons = ctx.heavyTons ?? DEFAULT_HEAVY_TONS;
  const pool = ctx.drivers
    .filter((d) => canHaulContainer(d))
    .filter((d) => driverDayStatus(d, ctx.date, ctx.allJobs, ctx.leaves).state === "free")
    .sort((a, b) => queueCompare(a, b, ctx.lastJobDate));

  const used = new Set<string>();
  const targets = ctx.targets.filter((j) => !j.driver_id && !j.cancelled);
  const ordered = [...targets.filter((j) => isHeavy(j, heavyTons)), ...targets.filter((j) => !isHeavy(j, heavyTons))];

  const assignments: AutoAssignResult["assignments"] = [];
  let shortage = 0;
  for (const j of ordered) {
    const heavy = isHeavy(j, heavyTons);
    const d = pool.find((x) => !used.has(x.id) && (!heavy || acceptsHeavy(x)));
    if (!d) {
      shortage++;
      continue;
    }
    used.add(d.id);
    assignments.push({ jobId: j.id, driverId: d.id });
  }
  // คืนผลตามลำดับตู้เดิมในตาราง
  const pos = new Map(targets.map((j, i) => [j.id, i]));
  assignments.sort((a, b) => (pos.get(a.jobId) ?? 0) - (pos.get(b.jobId) ?? 0));
  return { assignments, shortage };
}

// ---------------------------------------------------------------------------
// patch สำหรับบันทึกการจัดคนขับลงตู้
// ---------------------------------------------------------------------------

export function payeeTypeOf(accountName: string | null | undefined): "บุคคล" | "นิติบุคคล" {
  const s = (accountName ?? "").replace(/\s+/g, "");
  return /^(บจก|หจก|บมจ|บริษัท|ห้างหุ้นส่วน)|จำกัด$/.test(s) ? "นิติบุคคล" : "บุคคล";
}

export function assignmentPatch(j: Job, d: Driver | null, rates: Rate[]): JobPatch {
  if (!d) {
    return {
      driver_id: null,
      driver_name: null,
      truck_no: null,
      phone: null,
      payee_type: null,
      account_name: null,
      bank: null,
      account_no: null,
      ...(j.price_manual ? {} : { price: null }),
    };
  }
  const price = j.price_manual
    ? j.price
    : suggestPrice(rates, { destination: j.destination, truckType: d.truck_type, weightKg: jobWeightKg(j) });
  return {
    driver_id: d.id,
    driver_name: d.name,
    truck_no: d.truck_no,
    phone: d.phone,
    payee_type: payeeTypeOf(d.account_name),
    account_name: d.account_name,
    bank: d.bank,
    account_no: d.account_no,
    price,
  };
}
