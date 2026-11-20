/**
 * อัปเดตงานลากตู้จากไฟล์ Excel ที่มีชีตเดียวแบบ WorkLog (เช่น "จัดการคนรถ 2026.xlsx" → Sheet1)
 *
 *   npm run import-worklog -- --file "file/จัดการคนรถ 2026.xlsx" --dry-run   # ดูว่าจะเพิ่ม/แก้อะไร ไม่เขียนฐานข้อมูล
 *   npm run import-worklog -- --file "file/จัดการคนรถ 2026.xlsx"             # เขียนจริง
 *   ตัวเลือก --sheet <ชื่อชีต> (ค่าเริ่มต้น: WorkLog ถ้ามี ไม่งั้น Sheet1)
 *
 * ต่างจาก import-sheet ตรงที่ไฟล์นี้ไม่มีชีต DriverMaster — จับคู่ชื่อคนขับกับตาราง drivers ในฐานข้อมูลแทน
 * (ชื่อตรงกัน หรือทะเบียนรถเดียวกัน + ชื่อต้น/นามสกุลตรงกัน) คนที่ไม่พบจะถูกสร้างเป็นคนขับใหม่แบบปิดใช้งาน
 * และหาตู้ที่มีอยู่แล้ว (นำเข้าจาก Sheet / สร้างในแอป / มาจาก KOLA) เพื่ออัปเดตแทนการเพิ่มซ้ำ:
 *   1) legacy_key เดียวกัน  2) เลขตู้ + วันรับตู้ตรงกัน  3) เลขตู้ + BL ตรงกัน และในฐานข้อมูลยังไม่ได้รับตู้
 * แถวที่มีอยู่แล้ว: เขียนทับเฉพาะช่องที่ใน Excel มีค่า (ช่องว่างใน Excel ไม่ลบค่าที่กรอกในแอป, ไม่เปลี่ยนวันแพลน)
 *
 * ต้องตั้งค่าใน .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (ใช้แม้ตอน --dry-run เพื่ออ่านข้อมูลเดิม)
 */
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { bool, clean, date, num, readSheet, str, type Rec } from "./sheet-utils";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const fileArg = opt("--file");
const sheetArg = opt("--sheet");

type Row = Record<string, string | number | boolean | null>;
type Existing = {
  id: string;
  legacy_key: string | null;
  container_no: string;
  bl_no: string | null;
  pickup_date: string | null;
} & Row;

/** อ่านค่าคอลัมน์แรกที่มีอยู่ในแถว (ชื่อหัวคอลัมน์ต่างกันเล็กน้อยระหว่างไฟล์) */
const pick = (r: Rec, ...names: string[]) => {
  for (const n of names) if (n in r) return r[n];
  return null;
};

/** ช่องที่นำมาจาก Excel (ใช้ทั้งตอนเพิ่มและอัปเดต) */
function sheetFields(r: Rec, driverId: string | null) {
  const price = num(r["ราคารถขนส่ง"]);
  const payee = str(r["ประเภทผู้รับเงิน"]);
  const driverName = str(r["ชื่อคนขับรถ"]);
  return {
    customer: str(r["Customer Name"]),
    bl_no: str(pick(r, "BL no.", "BL no. / Booking No.")),
    weight_doc_kg: num(r["น้ำหนักตามเอกสาร (Kg.)"]),
    weight_actual_kg: num(r["น้ำหนักจริง (Kg.)"]),
    port: str(r["เลขท่าเรือ"]),
    destination: str(r["ปลายทาง"]),
    job_type: str(r["ประเภทงาน"]),
    shipping: str(r["ชื่อชิปปิ้ง"]),
    driver_id: driverId,
    driver_name: driverName ? clean(driverName) : null,
    truck_no: str(r["ทะเบียนรถ"]),
    phone: str(r["โทรศัพท์"]),
    payee_type: payee === "บุคคล" || payee === "นิติบุคคล" ? payee : null,
    account_name: str(r["ชื่อบัญชี"]),
    bank: str(r["บัญชีธนาคาร"]),
    account_no: str(r["เลขที่บัญชี"]),
    pickup_date: date(r["วันที่รับตู้คอนเทนเนอร์"]),
    end_date: date(r["วันที่จบงาน"]),
    return_due_date: date(r["วันที่ต้องคืนตู้คอนเทนเนอร์"]),
    // ไฟล์นี้มีคอลัมน์ "วันที่คืนตู้" คอลัมน์เดียว (ทุกแถวสถานะ "ปิดงาน") จึงถือเป็นวันคืนตู้จริง
    return_date: date(pick(r, "วันที่คืนตู้จริง", "วันที่คืนตู้")),
    price,
    price_manual: price !== null ? true : null,
    overweight_fee: num(r["ค่าน้ำหนักเกิน"]),
    overnight_fee: num(r["ค่าค้างคืน"]),
    other_fee: num(r["อื่น ๆ"]),
    wh_tax: num(r["WH Tax"]),
    overweight_fee_2: num(r["ค่าน้ำหนักเกิน 2"]),
    demurrage_fee: num(r["ค่าตกค้าง"]),
    late_return_fee: num(r["ค่าคืนตู้ล่าช้า"]),
    cleaning_fee: num(r["Cleaning/Repair/อื่นๆ"]),
    wh_tax_2: num(r["WH Tax 2"]),
    // ติ๊กเอกสารเฉพาะที่ Excel ติ๊กไว้ (ไม่เอาติ๊กที่กรอกในแอปออก)
    doc_certified: bool(r["รับรองสำเนาถูกต้อง"]) || null,
    doc_50tawi: bool(r["รับ 50ทวิ"]) || null,
    doc_tax_invoice: bool(r["ใบกำกับภาษี"]) || null,
    note: str(r["หมายเหตุ"]),
  };
}

const same = (a: unknown, b: unknown) => {
  if (a === null || a === undefined || b === null || b === undefined) return a == b;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a) === String(b);
};

async function main() {
  if (!fileArg) throw new Error('ระบุไฟล์ด้วย --file "file/จัดการคนรถ 2026.xlsx"');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await readFile(fileArg)) as unknown as ArrayBuffer);
  const sheetName = sheetArg ?? (wb.getWorksheet("WorkLog") ? "WorkLog" : "Sheet1");
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`ไม่พบชีต "${sheetName}" (มี: ${wb.worksheets.map((w) => w.name).join(", ")})`);
  // หัวตารางอยู่แถว 1 หรือ 2 แล้วแต่ไฟล์
  const headerRow = [1, 2, 3].find((n) => (ws.getRow(n).values as unknown[]).some((v) => clean(v) === "เลขตู้"));
  if (!headerRow) throw new Error(`ชีต "${sheetName}" ไม่มีคอลัมน์ "เลขตู้"`);
  const rows = readSheet(wb, sheetName, headerRow).filter((r) => str(r["เลขตู้"]));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY ใน .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // ---------------------------------------------------------------- ข้อมูลเดิมในฐานข้อมูล
  const { data: drivers, error: dErr } = await sb.from("drivers").select("id, name, truck_no");
  if (dErr) throw new Error(`drivers: ${dErr.message}`);
  const byName = new Map(drivers.map((d) => [clean(d.name), d.id as string]));
  const plate = (s: unknown) => clean(s).replace(/\s+/g, "");

  // ชื่อไม่ตรงเป๊ะ: ทะเบียนรถเดียวกัน + ชื่อต้นหรือนามสกุลเดียวกัน (เช่น สะกดนามสกุลต่างกัน)
  const aliases: string[] = [];
  for (const r of rows) {
    const name = clean(r["ชื่อคนขับรถ"]);
    if (!name || byName.has(name)) continue;
    const [first, last] = name.split(" ");
    const truck = plate(r["ทะเบียนรถ"]);
    const d = drivers.find((d) => {
      const [f2, l2] = clean(d.name).split(" ");
      return truck && plate(d.truck_no) === truck && (f2 === first || (!!last && l2 === last));
    });
    if (d) {
      byName.set(name, d.id);
      aliases.push(`${name} → ${d.id} ${d.name}`);
    }
  }

  // คนขับที่ไม่มีในตาราง drivers: สร้างให้ (ปิดใช้งานไว้ก่อน เพราะไม่อยู่ใน DriverMaster ล่าสุด — เปิดเองในแอปถ้ายังวิ่งอยู่)
  let maxId = Math.max(0, ...drivers.map((d) => Number(String(d.id).replace(/\D/g, "")) || 0));
  const newDrivers: Row[] = [];
  const latest = [...rows].sort((a, b) =>
    String(date(b["วันที่รับตู้คอนเทนเนอร์"]) ?? "").localeCompare(String(date(a["วันที่รับตู้คอนเทนเนอร์"]) ?? "")),
  );
  for (const r of latest) {
    const name = clean(r["ชื่อคนขับรถ"]);
    if (!name || byName.has(name)) continue;
    const id = `D${String(++maxId).padStart(3, "0")}`;
    byName.set(name, id);
    // ค่าล่าสุดที่ไม่ว่างของแต่ละช่อง (บางแถวกรอกทะเบียน/บัญชีไม่ครบ)
    const mine = latest.filter((x) => clean(x["ชื่อคนขับรถ"]) === name);
    const last = (col: string) => mine.map((x) => str(x[col])).find((v) => v !== null) ?? null;
    newDrivers.push({
      id,
      name,
      truck_no: last("ทะเบียนรถ"),
      truck_type: mine.some((x) => clean(x["ชื่อบัญชี"]).includes("ทีทีเอ็น")) ? "company" : "partner",
      phone: last("โทรศัพท์"),
      account_name: last("ชื่อบัญชี"),
      bank: last("บัญชีธนาคาร"),
      account_no: last("เลขที่บัญชี"),
      doc_note: `เพิ่มจาก ${fileArg.split(/[\\/]/).pop()}`,
      active: false,
    });
  }

  const existing: Existing[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("jobs").select("*").range(from, from + 999);
    if (error) throw new Error(`jobs: ${error.message}`);
    existing.push(...(data as Existing[]));
    if (data.length < 1000) break;
  }
  const byLegacy = new Map(existing.filter((j) => j.legacy_key).map((j) => [j.legacy_key!, j]));
  const taken = new Set<string>();
  const findExisting = (legacyKey: string, container: string, pickup: string | null, bl: string | null) => {
    const free = (j: Existing | undefined) => (j && !taken.has(j.id) ? j : undefined);
    return (
      free(byLegacy.get(legacyKey)) ??
      existing.find((j) => !taken.has(j.id) && j.container_no === container && pickup && j.pickup_date === pickup) ??
      existing.find((j) => !taken.has(j.id) && j.container_no === container && bl && j.bl_no === bl && !j.pickup_date)
    );
  };

  // ---------------------------------------------------------------- เทียบทีละแถว
  const keys = new Map<string, number>();
  const unmatchedNames = new Set<string>();
  const inserts: Row[] = [];
  const updates: { id: string; container: string; patch: Row }[] = [];
  let unchanged = 0;
  const changedCols = new Map<string, number>();

  for (const r of rows) {
    const container = clean(r["เลขตู้"]).toUpperCase().replace(/\s+/g, "");
    const driverName = str(r["ชื่อคนขับรถ"]);
    const driverId = driverName ? byName.get(clean(driverName)) ?? null : null;
    if (driverName && !driverId) unmatchedNames.add(clean(driverName));

    const f = sheetFields(r, driverId);
    let legacyKey = `worklog:${container}|${f.pickup_date ?? ""}|${f.bl_no ?? ""}`;
    const n = (keys.get(legacyKey) ?? 0) + 1;
    keys.set(legacyKey, n);
    if (n > 1) legacyKey += `#${n}`;

    const old = findExisting(legacyKey, container, f.pickup_date, f.bl_no);
    if (!old) {
      inserts.push({
        ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v ?? null])),
        price_manual: f.price !== null,
        doc_certified: !!f.doc_certified,
        doc_50tawi: !!f.doc_50tawi,
        doc_tax_invoice: !!f.doc_tax_invoice,
        legacy_key: legacyKey,
        plan_date: f.pickup_date ?? f.end_date ?? f.return_date ?? new Date().toISOString().slice(0, 10),
        container_no: container,
        cancelled: false,
      });
      continue;
    }
    taken.add(old.id);
    const patch: Row = {};
    for (const [k, v] of Object.entries(f)) {
      if (v === null || v === undefined) continue;
      if (!same(old[k], v)) patch[k] = v;
    }
    // Excel เปลี่ยนเป็นคนขับที่ไม่มีในตาราง drivers: เลิกผูกกับคนขับเดิม (เก็บแค่ชื่อ)
    if (f.driver_name && !driverId && old.driver_id && clean(old.driver_name) !== f.driver_name) patch.driver_id = null;
    if (!old.legacy_key && !byLegacy.has(legacyKey)) patch.legacy_key = legacyKey;
    const real = Object.keys(patch).filter((k) => k !== "legacy_key");
    if (!real.length && !patch.legacy_key) {
      unchanged++;
      continue;
    }
    real.forEach((k) => changedCols.set(k, (changedCols.get(k) ?? 0) + 1));
    if (!real.length) unchanged++;
    updates.push({ id: old.id, container, patch });
  }

  // ---------------------------------------------------------------- สรุป
  const pickups = rows.map((r) => date(r["วันที่รับตู้คอนเทนเนอร์"])).filter(Boolean).sort();
  console.log(`ไฟล์ ${fileArg} → ชีต "${sheetName}" (หัวตารางแถว ${headerRow})`);
  console.log(`  ${rows.length} ตู้ วันรับตู้ ${pickups[0] ?? "-"} ถึง ${pickups[pickups.length - 1] ?? "-"}`);
  console.log(`  ฐานข้อมูลมีงานอยู่ ${existing.length} ตู้, คนขับ ${drivers.length} คน`);
  console.log(`\n  เพิ่มใหม่      ${inserts.length} ตู้`);
  console.log(`  อัปเดต        ${updates.length - updates.filter((u) => Object.keys(u.patch).length === 1 && u.patch.legacy_key).length} ตู้`);
  console.log(`  ตรงกันอยู่แล้ว  ${unchanged} ตู้`);
  if (changedCols.size)
    console.log(`  ช่องที่เปลี่ยน   ${[...changedCols].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}(${c})`).join(", ")}`);
  if (aliases.length) console.log(`\n  จับคู่คนขับจากทะเบียนรถ (ชื่อสะกดต่าง):\n     ${aliases.join("\n     ")}`);
  if (newDrivers.length)
    console.log(
      `\n  คนขับใหม่ ${newDrivers.length} คน (สร้างแบบปิดใช้งาน):\n     ${newDrivers
        .map((d) => `${d.id} ${d.name} · ${d.truck_type === "company" ? "บริษัท" : "รถร่วม"} · ${d.truck_no ?? "-"}`)
        .join("\n     ")}`,
    );
  if (unmatchedNames.size) console.log(`\n  ⚠ ชื่อคนขับที่จับคู่ไม่ได้: ${[...unmatchedNames].join(", ")}`);
  for (const u of updates.slice(0, 10)) {
    const cols = Object.entries(u.patch).filter(([k]) => k !== "legacy_key");
    if (cols.length) console.log(`     ${u.container}: ${cols.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  if (DRY) {
    console.log("\n--dry-run: ไม่ได้เขียนฐานข้อมูล");
    return;
  }

  console.log("\nกำลังเขียน Supabase");
  if (newDrivers.length) {
    const { error } = await sb.from("drivers").insert(newDrivers);
    if (error) throw new Error(`เพิ่มคนขับ: ${error.message}`);
    console.log(`  ✓ เพิ่มคนขับ ${newDrivers.length} คน`);
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await sb.from("jobs").insert(inserts.slice(i, i + 500));
    if (error) throw new Error(`เพิ่มงาน: ${error.message}`);
  }
  console.log(`  ✓ เพิ่ม ${inserts.length} ตู้`);
  for (const u of updates) {
    const { error } = await sb.from("jobs").update(u.patch).eq("id", u.id);
    if (error) throw new Error(`อัปเดต ${u.container}: ${error.message}`);
  }
  console.log(`  ✓ อัปเดต ${updates.length} ตู้`);
  console.log("เสร็จแล้ว");
}

main().catch((e) => {
  console.error("ผิดพลาด:", e instanceof Error ? e.message : e);
  process.exit(1);
});
