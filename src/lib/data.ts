"use client";

import type { Driver, DriverStat, Job, JobPatch, Lookup, Rate, Unavailability } from "./types";
import { supabaseBrowser } from "./supabase/client";
import { addDays } from "./logic/dates";
import { DEMO, demo } from "./demo";

export interface BoardData {
  drivers: Driver[];
  jobs: Job[];
  leaves: Unavailability[];
  rates: Rate[];
  lookups: Lookup[];
  lastJobDate: Map<string, string | null>;
}

/** จำนวนวันก่อน/หลังวันที่เลือกที่โหลดมาไว้ (ใช้กับแถบวัน ความว่างของคนขับ และแจ้งเตือนคืนตู้) */
export const WINDOW_DAYS = 21;

const JOB_COLUMNS =
  "id,plan_id,plan_date,customer,bl_no,container_no,weight_doc_kg,weight_actual_kg,port,destination,job_type,shipping," +
  "driver_id,driver_name,truck_no,phone,payee_type,account_name,bank,account_no,pickup_date,end_date,return_due_date,return_date," +
  "price,price_manual,overweight_fee,overnight_fee,other_fee,wh_tax,note,cancelled,updated_at";

/** คอลัมน์ข้อมูลประกอบจาก ERP KOLA — มีหลังรัน migration 20261118000200_kola_inbound.sql */
const KOLA_COLUMNS =
  ",source,source_job_no,shipper,shipline,vessel,eta,eta_official,do_status,dem_free_until,det_days,bl_containers";
let kolaColumns = true;

const NUMERIC_JOB_FIELDS = [
  "weight_doc_kg",
  "weight_actual_kg",
  "price",
  "overweight_fee",
  "overnight_fee",
  "other_fee",
  "wh_tax",
] as const;

/** Postgres numeric มาเป็น string ใน JSON → แปลงเป็น number */
function normalizeJob(row: Record<string, unknown>): Job {
  const j = { ...row } as Record<string, unknown>;
  for (const k of NUMERIC_JOB_FIELDS) j[k] = j[k] === null || j[k] === undefined ? null : Number(j[k]);
  return j as unknown as Job;
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? ([] as unknown)) as T;
}

function jobsQuery(sb: ReturnType<typeof supabaseBrowser>, columns: string, from: string, to: string, dueFrom: string) {
  return sb
    .from("jobs")
    .select(columns)
    .or(
      `and(plan_date.gte.${from},plan_date.lte.${to}),` +
        `and(pickup_date.not.is.null,end_date.is.null,cancelled.is.false),` +
        `and(return_due_date.not.is.null,return_date.is.null,cancelled.is.false,plan_date.gte.${dueFrom})`,
    )
    .order("plan_date")
    .order("bl_no", { nullsFirst: false })
    .order("container_no")
    .limit(5000);
}

/**
 * โหลดตู้พร้อมข้อมูลประกอบจาก KOLA — ถ้าฐานข้อมูลยังไม่ได้รัน migration ของ KOLA (คอลัมน์ไม่มี)
 * ถอยไปโหลดแบบเดิม หน้าจัดรถจึงใช้ได้ตลอด
 */
async function loadJobs(sb: ReturnType<typeof supabaseBrowser>, from: string, to: string, dueFrom: string) {
  if (kolaColumns) {
    const res = await jobsQuery(sb, JOB_COLUMNS + KOLA_COLUMNS, from, to, dueFrom);
    if (!res.error || res.error.code !== "42703") return res;
    kolaColumns = false;
  }
  return jobsQuery(sb, JOB_COLUMNS, from, to, dueFrom);
}

export async function loadBoard(date: string): Promise<BoardData> {
  if (DEMO) return demo.loadBoard();
  const sb = supabaseBrowser();
  const from = addDays(date, -WINDOW_DAYS);
  const to = addDays(date, WINDOW_DAYS);

  const [drivers, jobs, leaves, rates, lookups, stats] = await Promise.all([
    sb.from("drivers").select("*").order("id"),
    loadJobs(sb, from, to, addDays(date, -120)),
    sb.from("driver_unavailability").select("id,driver_id,start_date,end_date,note").or(`end_date.gte.${from},end_date.is.null`),
    sb.from("rates").select("id,destination,truck_type,max_tons,price"),
    sb.from("lookups").select("kind,value,sort").order("sort"),
    sb.from("driver_stats").select("driver_id,last_job_date,job_count"),
  ]);

  return {
    drivers: check(drivers, "โหลดคนขับ") as Driver[],
    jobs: (check(jobs, "โหลดงาน") as unknown as Record<string, unknown>[]).map(normalizeJob),
    leaves: check(leaves, "โหลดวันไม่ว่าง") as Unavailability[],
    rates: (check(rates, "โหลดอัตราค่าขนส่ง") as Rate[]).map((r) => ({
      ...r,
      price: Number(r.price),
      max_tons: r.max_tons === null ? null : Number(r.max_tons),
    })),
    lookups: check(lookups, "โหลดตัวเลือก") as Lookup[],
    lastJobDate: new Map((check(stats, "โหลดสถิติคนขับ") as DriverStat[]).map((s) => [s.driver_id, s.last_job_date])),
  };
}

export async function updateJobs(patches: { id: string; patch: JobPatch }[]): Promise<void> {
  if (DEMO) return demo.updateJobs(patches);
  const sb = supabaseBrowser();
  const results = await Promise.all(patches.map(({ id, patch }) => sb.from("jobs").update(patch).eq("id", id)));
  const err = results.find((r) => r.error)?.error;
  if (err) throw new Error(`บันทึกไม่สำเร็จ: ${err.message}`);
}

export interface NewPlanInput {
  plan_date: string;
  customer: string | null;
  shipping: string | null;
  source_text: string | null;
}

export type NewJobInput = Omit<JobPatch, "plan_id"> & { container_no: string; plan_date: string };

export async function createPlan(plan: NewPlanInput, jobs: NewJobInput[]): Promise<Job[]> {
  if (DEMO) return demo.createPlan(jobs);
  const sb = supabaseBrowser();
  const p = await sb.from("plans").insert(plan).select("id").single();
  if (p.error) throw new Error(`สร้างแพลนไม่สำเร็จ: ${p.error.message}`);
  const rows = jobs.map((j) => ({ ...j, plan_id: p.data.id }));
  const res = await sb.from("jobs").insert(rows).select(JOB_COLUMNS);
  if (res.error) throw new Error(`บันทึกตู้ไม่สำเร็จ: ${res.error.message}`);
  return (res.data as unknown as Record<string, unknown>[]).map(normalizeJob);
}

export async function deleteJobs(ids: string[]): Promise<void> {
  if (DEMO) return demo.deleteJobs(ids);
  const res = await supabaseBrowser().from("jobs").delete().in("id", ids);
  if (res.error) throw new Error(`ลบไม่สำเร็จ: ${res.error.message}`);
}

export async function nextDriverId(): Promise<string> {
  const res = await supabaseBrowser().from("drivers").select("id");
  const ids = (check(res, "อ่านรหัสคนขับ") as { id: string }[]).map((r) => Number(r.id.replace(/\D/g, "")) || 0);
  const next = (ids.length ? Math.max(...ids) : 0) + 1;
  return `D${String(next).padStart(3, "0")}`;
}

export async function addDriver(d: Omit<Driver, "id" | "active" | "peak_code" | "doc_note">): Promise<Driver> {
  if (DEMO) return demo.addDriver(d);
  const id = await nextDriverId();
  const res = await supabaseBrowser()
    .from("drivers")
    .insert({ ...d, id, active: true })
    .select("*")
    .single();
  if (res.error) throw new Error(`เพิ่มคนขับไม่สำเร็จ: ${res.error.message}`);
  return res.data as Driver;
}

export async function addUnavailability(u: Omit<Unavailability, "id">): Promise<Unavailability> {
  if (DEMO) return demo.addUnavailability(u);
  const res = await supabaseBrowser()
    .from("driver_unavailability")
    .insert(u)
    .select("id,driver_id,start_date,end_date,note")
    .single();
  if (res.error) throw new Error(`บันทึกวันไม่ว่างไม่สำเร็จ: ${res.error.message}`);
  return res.data as Unavailability;
}

export async function deleteUnavailability(id: string): Promise<void> {
  if (DEMO) return demo.deleteUnavailability(id);
  const res = await supabaseBrowser().from("driver_unavailability").delete().eq("id", id);
  if (res.error) throw new Error(`ลบไม่สำเร็จ: ${res.error.message}`);
}

/** เลขตู้ที่มีอยู่แล้วและยังไม่ปิดงาน (กันนำเข้าซ้ำ) */
export async function findOpenContainers(containerNos: string[]): Promise<Map<string, Job>> {
  if (!containerNos.length) return new Map();
  if (DEMO) return demo.findOpenContainers(containerNos);
  const res = await supabaseBrowser()
    .from("jobs")
    .select(JOB_COLUMNS)
    .in("container_no", containerNos)
    .is("end_date", null)
    .eq("cancelled", false);
  const rows = (check(res, "ตรวจตู้ซ้ำ") as unknown as Record<string, unknown>[]).map(normalizeJob);
  return new Map(rows.map((j) => [j.container_no, j]));
}

export function subscribeBoard(onChange: () => void): () => void {
  if (DEMO) return () => {};
  const sb = supabaseBrowser();
  const ch = sb
    .channel("board")
    .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "driver_unavailability" }, onChange)
    .subscribe();
  return () => {
    sb.removeChannel(ch);
  };
}
