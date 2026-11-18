import type { Job } from "../types";
import { diffDays } from "./dates";

export type JobStatus = "unassigned" | "assigned" | "running" | "done" | "cancelled";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  unassigned: "รอจัดรถ",
  assigned: "จัดรถแล้ว",
  running: "กำลังวิ่ง",
  done: "ปิดงาน",
  cancelled: "ยกเลิก",
};

export function jobStatus(
  j: Pick<Job, "cancelled" | "driver_id" | "driver_name" | "pickup_date" | "end_date"> & Partial<Pick<Job, "return_date">>,
): JobStatus {
  if (j.cancelled) return "cancelled";
  // คืนตู้แล้วแปลว่าลากเสร็จแล้ว แม้ไม่ได้กรอกวันจบงาน
  if (j.end_date || j.return_date) return "done";
  if (j.pickup_date) return "running";
  if (j.driver_id || j.driver_name) return "assigned";
  return "unassigned";
}

export type ReturnAlert =
  | { level: "overdue"; days: number }
  | { level: "due-soon"; days: number }
  | { level: "returned-late"; days: number };

/** แจ้งเตือนการคืนตู้: เกินกำหนด / ใกล้ครบกำหนด (ภายใน 1 วัน) / คืนล่าช้า */
export function returnAlert(j: Pick<Job, "return_due_date" | "return_date" | "cancelled">, today: string): ReturnAlert | null {
  if (j.cancelled || !j.return_due_date) return null;
  if (j.return_date) {
    const late = diffDays(j.return_date, j.return_due_date);
    return late > 0 ? { level: "returned-late", days: late } : null;
  }
  const left = diffDays(j.return_due_date, today);
  if (left < 0) return { level: "overdue", days: -left };
  if (left <= 1) return { level: "due-soon", days: left };
  return null;
}

export type StepField = "pickup_date" | "end_date" | "return_date";

/** ปุ่มขั้นถัดไปของงาน: รับตู้แล้ว → จบงาน → คืนตู้แล้ว */
export function nextStep(j: Job): { field: StepField; label: string } | null {
  const s = jobStatus(j);
  if (s === "assigned") return { field: "pickup_date", label: "รับตู้แล้ว" };
  if (s === "running") return { field: "end_date", label: "จบงาน" };
  if (s === "done" && !j.return_date) return { field: "return_date", label: "คืนตู้แล้ว" };
  return null;
}

export function jobWeightKg(j: Pick<Job, "weight_actual_kg" | "weight_doc_kg">): number | null {
  return j.weight_actual_kg ?? j.weight_doc_kg ?? null;
}
