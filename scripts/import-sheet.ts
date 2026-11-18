/**
 * นำเข้าข้อมูลเดิมจาก Google Sheet เข้า Supabase
 *
 *   npm run import-sheet -- --dry-run            # อ่านและสรุปผล ไม่เขียนฐานข้อมูล
 *   npm run import-sheet                          # เพิ่มเฉพาะแถวใหม่ (ไม่ทับข้อมูลที่แก้ในแอปแล้ว)
 *   npm run import-sheet -- --overwrite           # อัปเดตแถวที่เคยนำเข้าแล้วด้วยค่าจาก Sheet
 *   npm run import-sheet -- --file ./book.xlsx    # ใช้ไฟล์ .xlsx ในเครื่องแทนการดาวน์โหลด
 *
 * ต้องตั้งค่าใน .env.local: GOOGLE_SHEET_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
 * (ข้อมูลคนขับ/บัญชีธนาคารไม่ถูกเก็บใน git — สคริปต์อ่านจาก Sheet ตอนรันเท่านั้น)
 */
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

type Cell = string | number | boolean | Date | null;
type Rec = Record<string, Cell>;

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const OVERWRITE = args.includes("--overwrite");
const fileArg = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;

const clean = (s: unknown) =>
  s === null || s === undefined ? "" : String(s).replace(/ /g, " ").replace(/\s+/g, " ").trim();
const str = (v: Cell) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  const s = clean(v);
  return s === "" || s === "-" ? null : s;
};
const num = (v: Cell) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};
const date = (v: Cell) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
};
const bool = (v: Cell) => v === true || v === "TRUE";

function cellValue(c: ExcelJS.Cell): Cell {
  const v = c.value as unknown;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("error" in o) return null;
    if ("result" in o) return (o.result as Cell) ?? null;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text);
    return null;
  }
  return v as Cell;
}

function readSheet(wb: ExcelJS.Workbook, name: string, headerRow: number): Rec[] {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`ไม่พบชีต "${name}"`);
  const headers: string[] = [];
  ws.getRow(headerRow).eachCell({ includeEmpty: true }, (c, col) => (headers[col] = clean(cellValue(c))));
  const out: Rec[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rec: Rec = {};
    let any = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const v = cellValue(row.getCell(col));
      rec[h] = v;
      if (v !== null && v !== "") any = true;
    });
    if (any) out.push(rec);
  }
  return out;
}

async function loadWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  if (fileArg) {
    await wb.xlsx.load((await readFile(fileArg)) as unknown as ArrayBuffer);
    return wb;
  }
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("ตั้งค่า GOOGLE_SHEET_ID ใน .env.local หรือใช้ --file");
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`);
  if (!res.ok) throw new Error(`ดาวน์โหลด Sheet ไม่สำเร็จ (${res.status}) — Sheet ต้องเปิดให้ผู้มีลิงก์อ่านได้ หรือดาวน์โหลดเองแล้วใช้ --file`);
  await wb.xlsx.load(await res.arrayBuffer());
  return wb;
}

function truckType(v: Cell): "company" | "partner" {
  return clean(v) === "บริษัท" ? "company" : "partner";
}

async function main() {
  const wb = await loadWorkbook();

  // ---------------------------------------------------------------- drivers
  const master = readSheet(wb, "DriverMaster", 1).filter((r) => str(r["DriverID"]) && str(r["DriverName"]));
  const queue = readSheet(wb, "Queue", 1).filter((r) => str(r["DriverID"]) && str(r["DriverName"]));
  const jobClass = new Map(queue.map((r) => [str(r["DriverID"])!, str(r["ประเภทที่รับงาน"])]));

  const drivers = new Map<string, Record<string, unknown>>();
  for (const r of master) {
    const id = str(r["DriverID"])!;
    drivers.set(id, {
      id,
      peak_code: str(r["Peak code"]),
      name: clean(r["DriverName"]),
      truck_no: str(r["TruckNo"]),
      truck_type: truckType(r["TruckType"]),
      phone: str(r["Tel."]),
      account_name: str(r["ชื่อบัญชี"]),
      bank: str(r["บัญชีธนาคาร"]),
      account_no: str(r["เลขที่บัญชี"]),
      fleet: str(r["หมายเหตุ"]),
      job_class: jobClass.get(id) ?? null,
      doc_note: str(r["เอกสารพขร."]),
      active: true,
    });
  }
  let queueOnly = 0;
  for (const r of queue) {
    const id = str(r["DriverID"])!;
    if (drivers.has(id)) continue;
    queueOnly++;
    drivers.set(id, {
      id,
      peak_code: null,
      name: clean(r["DriverName"]),
      truck_no: str(r["TruckNo"]),
      truck_type: truckType(r["TruckType"]),
      phone: null,
      account_name: null,
      bank: null,
      account_no: null,
      fleet: str(r["Remark"]),
      job_class: str(r["ประเภทที่รับงาน"]),
      doc_note: null,
      active: true,
    });
  }
  const byName = new Map<string, string>();
  for (const d of drivers.values()) byName.set(clean(d.name), d.id as string);

  // ---------------------------------------------------------------- jobs
  const log = readSheet(wb, "WorkLog", 2).filter((r) => str(r["เลขตู้"]));
  const keys = new Map<string, number>();
  let unmatched = 0;
  const unmatchedNames = new Set<string>();
  const jobs = log.map((r) => {
    const container = clean(r["เลขตู้"]).toUpperCase().replace(/\s+/g, "");
    const pickup = date(r["วันที่รับตู้คอนเทนเนอร์"]);
    const end = date(r["วันที่จบงาน"]);
    const due = date(r["วันที่ต้องคืนตู้คอนเทนเนอร์"]);
    const bl = str(r["BL no."]);
    const driverName = str(r["ชื่อคนขับรถ"]);
    const driverId = driverName ? byName.get(clean(driverName)) ?? null : null;
    if (driverName && !driverId) {
      unmatched++;
      unmatchedNames.add(driverName);
    }
    let key = `worklog:${container}|${pickup ?? ""}|${bl ?? ""}`;
    const n = (keys.get(key) ?? 0) + 1;
    keys.set(key, n);
    if (n > 1) key += `#${n}`;
    const price = num(r["ราคารถขนส่ง"]);
    const payee = str(r["ประเภทผู้รับเงิน"]);
    return {
      legacy_key: key,
      plan_date: pickup ?? end ?? due ?? new Date().toISOString().slice(0, 10),
      customer: str(r["Customer Name"]),
      bl_no: bl,
      container_no: container,
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
      pickup_date: pickup,
      end_date: end,
      return_due_date: due,
      return_date: date(r["วันที่คืนตู้จริง"]),
      price,
      price_manual: price !== null,
      overweight_fee: num(r["ค่าน้ำหนักเกิน"]),
      overnight_fee: num(r["ค่าค้างคืน"]),
      other_fee: num(r["อื่น ๆ"]),
      wh_tax: num(r["WH Tax"]),
      overweight_fee_2: num(r["ค่าน้ำหนักเกิน 2"]),
      demurrage_fee: num(r["ค่าตกค้าง"]),
      late_return_fee: num(r["ค่าคืนตู้ล่าช้า"]),
      cleaning_fee: num(r["Cleaning/Repair/อื่นๆ"]),
      wh_tax_2: num(r["WH Tax 2"]),
      doc_certified: bool(r["รับรองสำเนาถูกต้อง"]),
      doc_50tawi: bool(r["รับ 50ทวิ"]),
      doc_tax_invoice: bool(r["ใบกำกับภาษี"]),
      note: str(r["หมายเหตุ"]),
      cancelled: false,
    };
  });

  // ---------------------------------------------------------------- leaves (งานนอก)
  const leaveRows = readSheet(wb, "งานนอก", 1).filter((r) => str(r["DriverName"]));
  let leaveUnmatched = 0;
  const leaves = leaveRows.flatMap((r) => {
    const id = byName.get(clean(r["DriverName"]));
    if (!id) {
      leaveUnmatched++;
      return [];
    }
    const start = date(r["StartDate"]);
    const end = date(r["EndDate"]);
    if (!start && !end) return [];
    const note = str(r["Note"]);
    return [{ legacy_key: `leave:${id}|${start ?? ""}|${end ?? ""}|${note ?? ""}`, driver_id: id, start_date: start, end_date: end, note }];
  });
  const leaveMap = new Map(leaves.map((l) => [l.legacy_key, l]));

  // ---------------------------------------------------------------- rates (ราคาที่จ่ายบ่อยที่สุดต่อ ปลายทาง+ประเภทรถ)
  const freq = new Map<string, Map<number, number>>();
  for (const j of jobs) {
    if (!j.destination || j.price === null || !j.driver_id) continue;
    const t = drivers.get(j.driver_id)?.truck_type as string;
    const k = `${j.destination}|${t}`;
    const m = freq.get(k) ?? new Map<number, number>();
    m.set(j.price, (m.get(j.price) ?? 0) + 1);
    freq.set(k, m);
  }
  const rates = [...freq.entries()].map(([k, m]) => {
    const [destination, truck_type] = k.split("|");
    const [price, count] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return { destination, truck_type, max_tons: null, price, note: `ค่าที่ใช้บ่อยสุดจากประวัติ (${count} เที่ยว)` };
  });

  console.log("สรุปข้อมูลจาก Sheet");
  console.log(`  คนขับ        ${drivers.size} คน (บริษัท ${[...drivers.values()].filter((d) => d.truck_type === "company").length}, มีเฉพาะใน Queue ${queueOnly})`);
  console.log(`  งานลากตู้    ${jobs.length} ตู้ (ชื่อคนขับที่จับคู่ไม่ได้ ${unmatched} แถว)`);
  if (unmatchedNames.size) console.log(`               ชื่อที่ไม่พบใน DriverMaster: ${[...unmatchedNames].join(", ")}`);
  console.log(`  วันไม่ว่าง    ${leaveMap.size} รายการ (จับคู่ชื่อไม่ได้ ${leaveUnmatched})`);
  console.log(`  อัตราเริ่มต้น  ${rates.length} รายการ`);
  rates.forEach((r) => console.log(`               ${r.destination} / ${r.truck_type === "company" ? "บริษัท" : "รถร่วม"} = ${r.price}`));

  if (DRY) {
    console.log("\n--dry-run: ไม่ได้เขียนฐานข้อมูล");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY ใน .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
    let done = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await sb.from(table).upsert(chunk, { onConflict, ignoreDuplicates: !OVERWRITE });
      if (error) throw new Error(`${table}: ${error.message}`);
      done += chunk.length;
    }
    console.log(`  ✓ ${table} ${done} แถว`);
  }

  console.log(`\nกำลังเขียน Supabase (${OVERWRITE ? "อัปเดตทับ" : "เพิ่มเฉพาะแถวใหม่"})`);
  await upsert("drivers", [...drivers.values()], "id");
  await upsert("jobs", jobs, "legacy_key");
  await upsert("driver_unavailability", [...leaveMap.values()], "legacy_key");

  const { count } = await sb.from("rates").select("id", { count: "exact", head: true });
  if (!count) {
    const { error } = await sb.from("rates").insert(rates);
    if (error) throw new Error(`rates: ${error.message}`);
    console.log(`  ✓ rates ${rates.length} แถว`);
  } else {
    console.log(`  - rates มีอยู่แล้ว ${count} แถว (ไม่แตะ)`);
  }
  console.log("เสร็จแล้ว");
}

main().catch((e) => {
  console.error("ผิดพลาด:", e instanceof Error ? e.message : e);
  process.exit(1);
});
