import type { Job } from "../types";
import { diffDays, formatThaiDate, weekday } from "./dates";

/**
 * ข้อมูลประกอบการลากตู้ที่มากับแพลนจาก ERP KOLA — ใช้ตัดสินใจว่าควรลากวันไหน รีบคืนตู้ไหม
 *
 *   D/O        สายเรือปล่อย D/O แล้วหรือยัง (ยังไม่ได้ = ไปรับตู้ไม่ได้)
 *   DEM        free time ตู้อยู่ท่า นับจาก ETA — ลากหลังวันนี้มีค่า DEM
 *   DET        free time ตู้ออกจากท่าแล้วต้องคืนภายใน — สั้น (≤ 3 วัน เช่น CNC) ต้องรีบคืน
 *              ลากวันศุกร์แล้ววันคืนตู้ตกเสาร์-อาทิตย์ เสี่ยงคืนช้า
 *   ETA        ยังไม่ยืนยันจากระบบกรม = เรืออาจเลื่อน ตู้อาจยังไม่ลง
 */
export const SHORT_DET_DAYS = 3;

export type KolaFlag = { level: "bad" | "warn" | "info"; text: string };

export function kolaFlags(j: Job): KolaFlag[] {
  if (j.source !== "KOLA") return [];
  const flags: KolaFlag[] = [];
  const day = j.plan_date;

  // KOLA ส่ง "ยังไม่แลก" · "ส่งแลกแล้ว · รอ D/O" · "ได้ D/O แล้ว"
  if (j.do_status?.startsWith("ยังไม่")) flags.push({ level: "bad", text: `D/O ${j.do_status}` });
  else if (j.do_status?.includes("รอ")) flags.push({ level: "warn", text: `D/O ${j.do_status}` });

  if (j.dem_free_until) {
    const left = diffDays(j.dem_free_until, day);
    if (left < 0) flags.push({ level: "bad", text: `เกิน DEM ${-left} วัน (ฟรีถึง ${formatThaiDate(j.dem_free_until)})` });
    else if (left <= 1) flags.push({ level: "warn", text: `DEM ฟรีถึง ${formatThaiDate(j.dem_free_until)}` });
  }

  if (j.det_days != null && j.det_days > 0) {
    if (j.det_days <= SHORT_DET_DAYS) flags.push({ level: "warn", text: `DET ${j.det_days} วัน รีบคืนตู้` });
    if (j.return_due_date && !j.pickup_date) {
      const wd = weekday(j.return_due_date);
      if (wd === 0 || wd === 6) flags.push({ level: "warn", text: `คืนตู้ตรง${wd === 6 ? "เสาร์" : "อาทิตย์"}` });
    }
  }
  if (!j.pickup_date && weekday(day) === 5 && (j.det_days ?? 99) <= SHORT_DET_DAYS) {
    flags.push({ level: "warn", text: "ลากวันศุกร์ + DET สั้น" });
  }

  if (j.eta_official === false && !j.pickup_date) flags.push({ level: "info", text: "ETA ยังไม่ยืนยัน (เรืออาจเลื่อน)" });
  return flags;
}

/** สรุปหัวกลุ่ม BL — ใช้ตู้แรกที่มาจาก KOLA (ข้อมูลประกอบเป็นของทั้ง BL) */
export function kolaSummary(rows: Job[]) {
  const k = rows.find((j) => j.source === "KOLA" && !j.cancelled);
  if (!k) return null;
  const seen = new Set<string>();
  const flags = rows.flatMap(kolaFlags).filter((f) => !seen.has(f.text) && seen.add(f.text));
  return {
    shipper: k.shipper ?? null,
    shipline: k.shipline ?? null,
    vessel: k.vessel ?? null,
    eta: k.eta ?? null,
    etaOfficial: k.eta_official ?? null,
    doStatus: k.do_status ?? null,
    demUntil: k.dem_free_until ?? null,
    detDays: k.det_days ?? null,
    blContainers: k.bl_containers ?? null,
    jobNo: k.source_job_no ?? null,
    flags,
  };
}
