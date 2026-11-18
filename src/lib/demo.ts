/**
 * โหมดสาธิต (NEXT_PUBLIC_DEMO=1): ใช้ข้อมูลสมมติในหน่วยความจำ ไม่ต่อ Supabase
 * ใช้ทดลองหน้าจอ/ฝึกใช้งาน — ห้ามเปิดในโปรดักชัน
 */
import type { Driver, Job, JobPatch, Lookup, Rate, Unavailability } from "./types";
import { addDays, todayBangkok } from "./logic/dates";
import { containerCheckDigit } from "./logic/container";

export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

interface Store {
  drivers: Driver[];
  jobs: Job[];
  leaves: Unavailability[];
  rates: Rate[];
  lookups: Lookup[];
}

let store: Store | null = null;
let seq = 1000;
const uid = () => `demo-${++seq}`;

function cno(prefix: string, n: number) {
  const body = `${prefix}${String(n).padStart(6, "0")}`;
  return `${body}${containerCheckDigit(body)}`;
}

function driver(id: string, name: string, truck: string, type: "company" | "partner", fleet: string | null, cls: string): Driver {
  return {
    id,
    peak_code: null,
    name,
    truck_no: truck,
    truck_type: type,
    phone: `08${id.slice(1)}-000-${id.slice(1)}0`,
    account_name: fleet && fleet.startsWith("บจก") ? fleet : name,
    bank: "กสิกรไทย",
    account_no: `000-0-${id.slice(1)}00-0`,
    fleet,
    job_class: cls,
    doc_note: null,
    active: true,
  };
}

function baseJob(p: Partial<Job>): Job {
  return {
    id: uid(),
    plan_id: null,
    plan_date: todayBangkok(),
    customer: null,
    bl_no: null,
    container_no: "",
    weight_doc_kg: null,
    weight_actual_kg: null,
    port: null,
    destination: "MSFZ",
    job_type: "MSFZ - รถยนต์เก่า",
    shipping: "KOLA SHIPPING",
    driver_id: null,
    driver_name: null,
    truck_no: null,
    phone: null,
    payee_type: null,
    account_name: null,
    bank: null,
    account_no: null,
    pickup_date: null,
    end_date: null,
    return_due_date: null,
    return_date: null,
    price: null,
    price_manual: false,
    overweight_fee: null,
    overnight_fee: null,
    other_fee: null,
    wh_tax: null,
    note: null,
    cancelled: false,
    ...p,
  };
}

function withDriver(j: Job, d: Driver, price: number): Job {
  return {
    ...j,
    driver_id: d.id,
    driver_name: d.name,
    truck_no: d.truck_no,
    phone: d.phone,
    payee_type: "บุคคล",
    account_name: d.account_name,
    bank: d.bank,
    account_no: d.account_no,
    price,
  };
}

function seed(): Store {
  const t = todayBangkok();
  const drivers = [
    driver("D001", "สมชาย ตัวอย่าง", "70-1001 ตาก - 70-1002 ตาก", "company", "TTN", "เบาและหนัก"),
    driver("D002", "วิชัย ทดสอบ", "70-1003 ตาก - 70-1004 ตาก", "company", "TTN", "เบา"),
    driver("D003", "ประเสริฐ สาธิต", "70-1005 ตาก - 70-1006 ตาก", "company", "TTN", "เบาและหนัก"),
    driver("D004", "อนันต์ ใจดี", "71-2001 สมุทรปราการ - 71-2002", "partner", "บจก.ตัวอย่างโลจิสติกส์", "เบาและหนัก"),
    driver("D005", "บุญมี รักงาน", "71-2003 ชลบุรี - 71-2004", "partner", "บจก.ตัวอย่างโลจิสติกส์", "เบา"),
    driver("D006", "สุรชัย ขยัน", "72-3001 ระยอง - 72-3002", "partner", "หจก.สาธิตทรานสปอร์ต", "เบาและหนัก"),
    driver("D007", "ชาญ มั่นคง", "72-3003 สระบุรี - 72-3004", "partner", "หจก.สาธิตทรานสปอร์ต", "หนัก"),
    driver("D008", "เกียรติ ตรงเวลา", "73-4001 กำแพงเพชร - 73-4002", "partner", null, "เบา"),
    driver("D009", "ธนา ปลอดภัย", "73-4003 นครสวรรค์ - 73-4004", "partner", null, "เบาและหนัก"),
    driver("D010", "มานพ ทางไกล", "74-5001 ฉะเชิงเทรา - 74-5002", "partner", null, "เบา"),
    driver("D011", "ยุทธ ตู้ทึบ", "3ฒก-1234 กรุงเทพ", "partner", null, "กะบะตู้ทึบ"),
  ];
  const d = (id: string) => drivers.find((x) => x.id === id)!;
  const y = addDays(t, -1);
  const jobs: Job[] = [
    // เมื่อวาน: วิ่งอยู่ 1, ปิดงาน 2
    withDriver(baseJob({ plan_date: y, bl_no: "DEMOBL0001", customer: "ลูกค้า ก", container_no: cno("DEMU", 100001), weight_doc_kg: 13930, port: "C1C2", pickup_date: y, return_due_date: addDays(y, 3) }), d("D001"), 16000),
    withDriver(baseJob({ plan_date: y, bl_no: "DEMOBL0001", customer: "ลูกค้า ก", container_no: cno("DEMU", 100002), weight_doc_kg: 12100, port: "C1C2", pickup_date: y, end_date: t, return_due_date: addDays(y, 3) }), d("D004"), 20000),
    withDriver(baseJob({ plan_date: addDays(t, -5), bl_no: "DEMOBL0000", customer: "ลูกค้า ค", container_no: cno("DEMU", 100003), weight_doc_kg: 19890, port: "B4", pickup_date: addDays(t, -5), end_date: addDays(t, -4), return_due_date: addDays(t, -2) }), d("D006"), 20000),
    // วันนี้
    withDriver(baseJob({ bl_no: "DEMOBL0002", customer: "ลูกค้า ข", container_no: cno("DEMU", 100004), weight_actual_kg: 10900, port: "C3", return_due_date: addDays(t, 3) }), d("D002"), 16000),
    baseJob({ bl_no: "DEMOBL0002", customer: "ลูกค้า ข", container_no: cno("DEMU", 100005), weight_doc_kg: 11200, port: "C3", return_due_date: addDays(t, 3) }),
    baseJob({ bl_no: "DEMOBL0002", customer: "ลูกค้า ข", container_no: cno("DEMU", 100006), weight_doc_kg: 9800, port: "C3", return_due_date: addDays(t, 3) }),
    baseJob({ bl_no: "DEMOBL0003", customer: "ลูกค้า ง", container_no: cno("DEMU", 100007), weight_doc_kg: 21500, port: "D1", destination: "ท่า 18 แม่สอด", return_due_date: addDays(t, 4) }),
    baseJob({ bl_no: "DEMOBL0003", customer: "ลูกค้า ง", container_no: cno("DEMU", 100008), weight_doc_kg: 14300, port: "D1", destination: "ท่า 18 แม่สอด", return_due_date: addDays(t, 4) }),
    baseJob({ bl_no: "DEMOBL0003", customer: "ลูกค้า ง", container_no: cno("DEMU", 100009), weight_doc_kg: 13100, port: "D1", destination: "ท่า 18 แม่สอด", return_due_date: addDays(t, 4) }),
    // พรุ่งนี้
    baseJob({ plan_date: addDays(t, 1), bl_no: "DEMOBL0004", customer: "ลูกค้า ก", container_no: cno("DEMU", 100010), weight_doc_kg: 6080, port: "A0", return_due_date: addDays(t, 4) }),
    baseJob({ plan_date: addDays(t, 1), bl_no: "DEMOBL0004", customer: "ลูกค้า ก", container_no: cno("DEMU", 100011), weight_doc_kg: 7200, port: "A0", return_due_date: addDays(t, 4) }),
  ];
  return {
    drivers,
    jobs,
    leaves: [{ id: uid(), driver_id: "D003", start_date: addDays(t, -1), end_date: addDays(t, 1), note: "ซ่อมรถ" }],
    rates: [
      { id: "r1", destination: "MSFZ", truck_type: "company", max_tons: null, price: 16000 },
      { id: "r2", destination: "MSFZ", truck_type: "partner", max_tons: null, price: 20000 },
      { id: "r3", destination: "ท่า 18 แม่สอด", truck_type: "partner", max_tons: null, price: 20500 },
      { id: "r4", destination: "ท่าข้ามอื่น ๆ", truck_type: "partner", max_tons: null, price: 20500 },
    ],
    lookups: [
      ...["MSFZ", "ท่า 18 แม่สอด", "ท่าข้ามอื่น ๆ", "สะพาน 2", "ระนอง", "แม่สาย", "เชียงแสน"].map((value, sort) => ({ kind: "destination" as const, value, sort })),
      ...["MSFZ - รถยนต์เก่า", "MSFZ - Touch&Go", "MSFZ - งาน Roro", "สินค้าทั่วไป"].map((value, sort) => ({ kind: "job_type" as const, value, sort })),
      ...["A0", "A2", "B4", "B5", "C1C2", "C3", "D1", "KERRY"].map((value, sort) => ({ kind: "port" as const, value, sort })),
      { kind: "shipping", value: "KOLA SHIPPING", sort: 1 },
    ],
  };
}

function s(): Store {
  if (!store) store = seed();
  return store;
}

const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export const demo = {
  async loadBoard() {
    await wait();
    const st = s();
    const last = new Map<string, string | null>();
    for (const j of st.jobs) {
      if (!j.driver_id || j.cancelled) continue;
      const v = j.end_date ?? j.pickup_date ?? j.plan_date;
      if (!last.get(j.driver_id) || v > (last.get(j.driver_id) as string)) last.set(j.driver_id, v);
    }
    return { ...clone({ drivers: st.drivers, jobs: st.jobs, leaves: st.leaves, rates: st.rates, lookups: st.lookups }), lastJobDate: last };
  },
  async updateJobs(patches: { id: string; patch: JobPatch }[]) {
    await wait();
    const st = s();
    const m = new Map(patches.map((p) => [p.id, p.patch]));
    st.jobs = st.jobs.map((j) => (m.has(j.id) ? { ...j, ...m.get(j.id) } : j));
  },
  async createPlan(jobs: (JobPatch & { container_no: string; plan_date: string })[]) {
    await wait();
    const planId = uid();
    const created = jobs.map((j) => baseJob({ ...j, plan_id: planId, destination: j.destination ?? null, job_type: j.job_type ?? null }));
    s().jobs.push(...created);
    return clone(created);
  },
  async deleteJobs(ids: string[]) {
    await wait();
    s().jobs = s().jobs.filter((j) => !ids.includes(j.id));
  },
  async addDriver(d: Omit<Driver, "id" | "active" | "peak_code" | "doc_note">) {
    await wait();
    const ids = s().drivers.map((x) => Number(x.id.slice(1)));
    const created: Driver = { ...d, id: `D${String(Math.max(...ids) + 1).padStart(3, "0")}`, active: true, peak_code: null, doc_note: null };
    s().drivers.push(created);
    return clone(created);
  },
  async addUnavailability(u: Omit<Unavailability, "id">) {
    await wait();
    const created = { ...u, id: uid() };
    s().leaves.push(created);
    return clone(created);
  },
  async deleteUnavailability(id: string) {
    await wait();
    s().leaves = s().leaves.filter((l) => l.id !== id);
  },
  async findOpenContainers(nos: string[]) {
    return new Map(s().jobs.filter((j) => nos.includes(j.container_no) && !j.end_date && !j.cancelled).map((j) => [j.container_no, clone(j)]));
  },
};
