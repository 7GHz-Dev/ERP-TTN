import type { Driver, Job, Unavailability } from "../types";

export type DriverState = "free" | "busy" | "running" | "off";

export interface DriverDayStatus {
  state: DriverState;
  /** งานในวันนั้น หรืองานที่กำลังวิ่งอยู่ */
  jobs: Job[];
  leave: Unavailability | null;
}

export const DRIVER_STATE_LABEL: Record<DriverState, string> = {
  free: "ว่าง",
  busy: "มีงานแล้ว",
  running: "กำลังวิ่ง",
  off: "ไม่ว่าง",
};

function leaveCovers(l: Unavailability, date: string): boolean {
  const start = l.start_date ?? l.end_date;
  if (!start) return false;
  if (date < start) return false;
  if (l.end_date && date > l.end_date) return false;
  return true;
}

/**
 * สถานะคนขับในวันหนึ่ง
 * - off: ปิดใช้งาน หรือมีช่วงไม่ว่าง (งานนอก/ลา/ซ่อมรถ) ครอบวันนั้น (นับรวมวันเริ่มและวันสิ้นสุด)
 * - running: รับตู้แล้วแต่ยังไม่จบงาน (รับตู้ก่อนหรือในวันนั้น)
 * - busy: ถูกจัดให้ตู้อื่นในวันแพลนเดียวกันแล้ว
 */
export function driverDayStatus(
  driver: Driver,
  date: string,
  jobs: Job[],
  leaves: Unavailability[],
  excludeJobId?: string,
): DriverDayStatus {
  const leave = leaves.find((l) => l.driver_id === driver.id && leaveCovers(l, date)) ?? null;
  const mine = jobs.filter((j) => j.driver_id === driver.id && !j.cancelled && j.id !== excludeJobId);
  const running = mine.filter((j) => j.pickup_date && !j.end_date && j.pickup_date <= date);
  const sameDay = mine.filter((j) => j.plan_date === date && !running.includes(j));

  if (!driver.active || leave) return { state: "off", jobs: [...running, ...sameDay], leave };
  if (running.length) return { state: "running", jobs: [...running, ...sameDay], leave: null };
  if (sameDay.length) return { state: "busy", jobs: sameDay, leave: null };
  return { state: "free", jobs: [], leave: null };
}
