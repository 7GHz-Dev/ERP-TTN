/**
 * อัปเดตรายชื่อคนรถจากไฟล์ Excel (เช่น "file/driver master.xlsx")
 * คอลัมน์: ชื่อคนขับรถ, ทะเบียนรถ, โทรศัพท์, ชื่อบัญชี, บัญชีธนาคาร, เลขที่บัญชี (แถวซ้ำได้ — ใช้แถวล่างสุดของแต่ละชื่อ)
 *
 *   npm run import-drivers -- --file "file/driver master.xlsx" --dry-run
 *   npm run import-drivers -- --file "file/driver master.xlsx"
 *   ตัวเลือก --sheet <ชื่อชีต> (ค่าเริ่มต้น: ชีตแรก)
 *
 * - คนในไฟล์: อัปเดตทะเบียน/เบอร์/บัญชี และเปิดใช้งาน (ไม่พบชื่อ → สร้างใหม่)
 * - ชื่อบัญชีเป็น "ทีทีเอ็น" = รถบริษัท
 * - ไฟล์มีรถบริษัท → ถือเป็นรายชื่อรถบริษัทครบชุด: รถบริษัทในระบบที่ไม่อยู่ในไฟล์จะถูกปิดใช้งาน (ไม่ลบ ประวัติงานยังอยู่)
 * - ประเภทงาน/สังกัดที่ว่าง ใช้ค่าที่พบบ่อยที่สุดของคนรถประเภทเดียวกัน
 */
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { clean, readSheet, str } from "./sheet-utils";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const fileArg = opt("--file");

type Driver = {
  id: string;
  name: string;
  truck_no: string | null;
  truck_type: "company" | "partner";
  phone: string | null;
  account_name: string | null;
  bank: string | null;
  account_no: string | null;
  job_class: string | null;
  fleet: string | null;
  active: boolean;
};
const FIELDS = ["truck_no", "truck_type", "phone", "account_name", "bank", "account_no", "job_class", "fleet", "active"] as const;

const mostCommon = (vals: (string | null)[]) => {
  const m = new Map<string, number>();
  for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

async function main() {
  if (!fileArg) throw new Error('ระบุไฟล์ด้วย --file "file/driver master.xlsx"');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await readFile(fileArg)) as unknown as ArrayBuffer);
  const sheetName = opt("--sheet") ?? wb.worksheets[0]?.name;
  const rows = readSheet(wb, sheetName, 1).filter((r) => str(r["ชื่อคนขับรถ"]));

  // แถวล่างสุดของแต่ละชื่อ, ช่องว่างเติมจากแถวอื่นของชื่อเดียวกัน
  const fromFile = new Map<string, Partial<Driver>>();
  for (const r of rows) {
    const name = clean(r["ชื่อคนขับรถ"]);
    const prev = fromFile.get(name) ?? {};
    const pick = (col: string, old: string | null | undefined) => str(r[col]) ?? old ?? null;
    const account = pick("ชื่อบัญชี", prev.account_name);
    fromFile.set(name, {
      name,
      truck_no: pick("ทะเบียนรถ", prev.truck_no),
      phone: pick("โทรศัพท์", prev.phone),
      account_name: account,
      bank: pick("บัญชีธนาคาร", prev.bank),
      account_no: pick("เลขที่บัญชี", prev.account_no),
      truck_type: (account ?? "").includes("ทีทีเอ็น") ? "company" : "partner",
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY ใน .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.from("drivers").select("*").order("id");
  if (error) throw new Error(`drivers: ${error.message}`);
  const drivers = data as Driver[];
  const byName = new Map(drivers.map((d) => [clean(d.name), d]));
  const defaults = (t: Driver["truck_type"]) => {
    const same = drivers.filter((d) => d.truck_type === t);
    return { job_class: mostCommon(same.map((d) => d.job_class)), fleet: mostCommon(same.map((d) => d.fleet)) };
  };

  let maxId = Math.max(0, ...drivers.map((d) => Number(d.id.replace(/\D/g, "")) || 0));
  const inserts: Driver[] = [];
  const updates: { d: Driver; patch: Partial<Driver> }[] = [];
  for (const f of fromFile.values()) {
    const old = byName.get(f.name!);
    const def = defaults(f.truck_type!);
    if (!old) {
      inserts.push({ ...(f as Driver), id: `D${String(++maxId).padStart(3, "0")}`, ...def, active: true });
      continue;
    }
    const want: Partial<Driver> = {
      ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null)),
      job_class: old.job_class ?? def.job_class,
      fleet: old.fleet ?? def.fleet,
      active: true,
    };
    const patch = Object.fromEntries(
      FIELDS.filter((k) => k in want && want[k] !== old[k]).map((k) => [k, want[k]]),
    ) as Partial<Driver>;
    if (Object.keys(patch).length) updates.push({ d: old, patch });
  }
  const rosterHasCompany = [...fromFile.values()].some((f) => f.truck_type === "company");
  const deactivate = rosterHasCompany
    ? drivers.filter((d) => d.truck_type === "company" && d.active && !fromFile.has(clean(d.name)))
    : [];

  console.log(`ไฟล์ ${fileArg} → ชีต "${sheetName}": ${rows.length} แถว, ${fromFile.size} คน`);
  const label = (k: string, v: unknown) => `${k}: ${v === null ? "(ว่าง)" : v}`;
  if (updates.length) {
    console.log(`\nอัปเดต ${updates.length} คน`);
    for (const { d, patch } of updates)
      console.log(
        `  ${d.id} ${d.name}\n${Object.entries(patch)
          .map(([k, v]) => `     ${label(k, d[k as keyof Driver])} → ${v}`)
          .join("\n")}`,
      );
  }
  if (inserts.length) {
    console.log(`\nเพิ่มใหม่ ${inserts.length} คน`);
    inserts.forEach((d) => console.log(`  ${d.id} ${d.name} · ${d.truck_type} · ${d.truck_no ?? "-"}`));
  }
  if (deactivate.length) {
    console.log(`\nปิดใช้งาน ${deactivate.length} คน (รถบริษัทที่ไม่อยู่ในไฟล์)`);
    deactivate.forEach((d) => console.log(`  ${d.id} ${d.name} · ${d.truck_no ?? "-"}`));
  }
  if (!updates.length && !inserts.length && !deactivate.length) console.log("\nข้อมูลตรงกับไฟล์อยู่แล้ว");

  if (DRY) {
    console.log("\n--dry-run: ไม่ได้เขียนฐานข้อมูล");
    return;
  }
  for (const { d, patch } of updates) {
    const { error } = await sb.from("drivers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) throw new Error(`อัปเดต ${d.id}: ${error.message}`);
  }
  if (inserts.length) {
    const { error } = await sb.from("drivers").insert(inserts);
    if (error) throw new Error(`เพิ่มคนขับ: ${error.message}`);
  }
  if (deactivate.length) {
    const { error } = await sb
      .from("drivers")
      .update({ active: false, updated_at: new Date().toISOString() })
      .in("id", deactivate.map((d) => d.id));
    if (error) throw new Error(`ปิดใช้งาน: ${error.message}`);
  }
  console.log(`\n✓ อัปเดต ${updates.length} · เพิ่ม ${inserts.length} · ปิดใช้งาน ${deactivate.length}`);
}

main().catch((e) => {
  console.error("ผิดพลาด:", e instanceof Error ? e.message : e);
  process.exit(1);
});
