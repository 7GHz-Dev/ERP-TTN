import type { Job, TruckType } from "../types";
import { formatThaiDate } from "./dates";
import { computeMoney, formatBaht } from "./pricing";
import { jobWeightKg } from "./status";

export type MessageKind = "dispatch" | "notify" | "summary" | "withdraw" | "need-trucks";

export const MESSAGE_KINDS: { kind: MessageKind; label: string; hint: string }[] = [
  { kind: "dispatch", label: "จ่ายงาน", hint: "ส่งให้ พขร." },
  { kind: "notify", label: "แจ้งงานแม่สอด", hint: "แจ้งงานแม่สอด / ลากตู้ผ่านแดน" },
  { kind: "summary", label: "สรุปคนรับงาน", hint: "ส่งชิปปิ้งแหลม" },
  { kind: "withdraw", label: "ตั้งเบิก", hint: "ส่งแผนกบัญชี" },
  { kind: "need-trucks", label: "หารถร่วม", hint: "โพสต์หาเจ้าของรถร่วม" },
];

interface Ctx {
  truckTypeOf: (j: Job) => TruckType | null;
  date?: string;
}

const v = (s: string | null | undefined) => (s ?? "").trim();

function block(kind: Exclude<MessageKind, "need-trucks">, j: Job, ctx: Ctx): string[] {
  const weight = jobWeightKg(j);
  switch (kind) {
    case "dispatch":
      return [
        `BL : ${v(j.bl_no)}`,
        `เลขตู้ : ${j.container_no}`,
        `ประเภทงาน : ${v(j.job_type)}`,
        `น้ำหนักรวมตู้คอนเทนเนอร์ : ${formatBaht(weight)}`,
        `ต้นทางปล่อยตู้ : ${v(j.port)}`,
        `ปลายทาง : ${v(j.destination)}`,
        `ค่าบริการ : ${formatBaht(j.price)}`,
        `ชื่อพขร : ${v(j.driver_name)}`,
        `ทะเบียน : ${v(j.truck_no)}`,
        `โทรศัพท์ : ${v(j.phone)}`,
      ];
    case "notify":
      return [
        `BL: ${v(j.bl_no)}`,
        `เลขตู้ : ${j.container_no}`,
        `ชื่อพขร : ${v(j.driver_name)}`,
        `โทรศัพท์ : ${v(j.phone)}`,
        `ทะเบียน : ${v(j.truck_no)}`,
      ];
    case "summary":
      return [
        `BL : ${v(j.bl_no)}`,
        `เลขตู้ : ${j.container_no}`,
        `PORT : ${v(j.port)}`,
        `ปลายทาง : ${v(j.destination)}`,
        `ชื่อ พขร : ${v(j.driver_name)}`,
        `ทะเบียน : ${v(j.truck_no)}`,
        `โทรศัพท์ : ${v(j.phone)}`,
      ];
    case "withdraw": {
      const m = computeMoney(j, ctx.truckTypeOf(j));
      return [
        `BL : ${v(j.bl_no)}`,
        `เลขตู้ : ${j.container_no}`,
        `ชื่อพขร : ${v(j.driver_name)}`,
        `ทะเบียน : ${v(j.truck_no)}`,
        `บัญชีธนาคาร : ${v(j.bank)}`,
        `เลขบัญชี : ${v(j.account_no)}`,
        `ชื่อบัญชี : ${v(j.account_name)}`,
        `ยอดโอน : ${formatBaht(m.net)}`,
      ];
    }
  }
}

function needTrucks(jobs: Job[], ctx: Ctx): string {
  const groups = new Map<string, { port: string; dest: string; type: string; weights: number[] }>();
  for (const j of jobs) {
    const key = `${v(j.port)}|${v(j.destination)}|${v(j.job_type)}`;
    const g = groups.get(key) ?? { port: v(j.port), dest: v(j.destination), type: v(j.job_type), weights: [] };
    const w = jobWeightKg(j);
    if (w !== null) g.weights.push(w);
    groups.set(key, g);
  }
  const lines = [`ต้องการรถ ${jobs.length} คัน`];
  if (ctx.date) lines.push(`วันที่ ${formatThaiDate(ctx.date)}`);
  for (const g of groups.values()) {
    const count = jobs.filter((j) => `${v(j.port)}|${v(j.destination)}|${v(j.job_type)}` === `${g.port}|${g.dest}|${g.type}`).length;
    const route = [g.port && `ท่า ${g.port}`, g.dest && `→ ${g.dest}`].filter(Boolean).join(" ");
    const wt = g.weights.length
      ? ` · น้ำหนัก ${formatBaht(Math.min(...g.weights) / 1000)}${g.weights.length > 1 && Math.max(...g.weights) !== Math.min(...g.weights) ? `–${formatBaht(Math.max(...g.weights) / 1000)}` : ""} ตัน`
      : "";
    lines.push(`- ${route || "ไม่ระบุเส้นทาง"} ${count} ตู้${g.type ? ` (${g.type})` : ""}${wt}`);
  }
  lines.push("สนใจติดต่อกลับได้เลยครับ");
  return lines.join("\n");
}

export function buildMessage(kind: MessageKind, jobs: Job[], ctx: Ctx): string {
  if (kind === "need-trucks") return needTrucks(jobs, ctx);
  return jobs.map((j) => block(kind, j, ctx).join("\n")).join("\n\n");
}
