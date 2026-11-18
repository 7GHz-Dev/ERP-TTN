import { describe, expect, it } from "vitest";
import type { Driver, Job, Rate, Unavailability } from "../types";
import { addDays, diffDays, formatThaiDate } from "./dates";
import { containerCheckDigit, isValidContainerNo, normalizeContainerNo } from "./container";
import { parsePlanText } from "./parse-plan";
import { jobStatus, returnAlert } from "./status";
import { driverDayStatus } from "./availability";
import { autoAssign, rankDrivers } from "./assign";
import { computeMoney, suggestPrice } from "./pricing";
import { buildMessage } from "./messages";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------
function driver(p: Partial<Driver> & { id: string }): Driver {
  return {
    peak_code: null,
    name: `คนขับ ${p.id}`,
    truck_no: `70-${p.id}`,
    truck_type: "partner",
    phone: "080-000-0000",
    account_name: `คนขับ ${p.id}`,
    bank: "กสิกรไทย",
    account_no: "000-0-00000-0",
    fleet: null,
    job_class: null,
    doc_note: null,
    active: true,
    ...p,
  };
}

let jobSeq = 0;
function job(p: Partial<Job> = {}): Job {
  jobSeq += 1;
  return {
    id: `j${jobSeq}`,
    plan_id: null,
    plan_date: "2026-11-18",
    customer: "ลูกค้า",
    bl_no: "BL001",
    container_no: `TEST${String(jobSeq).padStart(7, "0")}`,
    weight_doc_kg: 10000,
    weight_actual_kg: null,
    port: "A0",
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

const D = "2026-11-18";

// ---------------------------------------------------------------------------
describe("dates", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("diffs days", () => {
    expect(diffDays("2026-11-20", "2026-11-18")).toBe(2);
    expect(diffDays("2026-11-18", "2026-11-20")).toBe(-2);
  });
  it("formats Thai short date with Buddhist year", () => {
    expect(formatThaiDate("2026-11-18")).toBe("18 พ.ย. 69");
  });
});

// ---------------------------------------------------------------------------
describe("container numbers", () => {
  it("normalizes spacing, dashes and case", () => {
    expect(normalizeContainerNo(" csqu 305438-3 ")).toBe("CSQU3054383");
  });
  it("computes the ISO 6346 check digit", () => {
    expect(containerCheckDigit("CSQU305438")).toBe(3);
  });
  it("validates full numbers", () => {
    expect(isValidContainerNo("CSQU3054383")).toBe(true);
    expect(isValidContainerNo("CSQU3054384")).toBe(false);
    expect(isValidContainerNo("CSQU305438")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("parsePlanText", () => {
  const ports = ["A0", "B4", "C1C2", "D1", "KERRY"];

  it("parses tab separated rows pasted from Excel in any column order", () => {
    const text = "BL no.\tเลขตู้\tน้ำหนัก\tท่า\nONEY123456\tCSQU3054383\t13,930\tC1C2\nONEY123456\tMSKU1234565\t9800\tD1";
    const r = parsePlanText(text, { ports });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ container_no: "CSQU3054383", bl_no: "ONEY123456", weight_kg: 13930, port: "C1C2" });
    expect(r[1]).toMatchObject({ container_no: "MSKU1234565", weight_kg: 9800, port: "D1" });
  });

  it("parses one container per line with only container numbers", () => {
    const r = parsePlanText("CSQU3054383\nmsku 123456-5\n\n", { ports });
    expect(r.map((x) => x.container_no)).toEqual(["CSQU3054383", "MSKU1234565"]);
    expect(r[0].bl_no).toBeNull();
  });

  it("carries a BL header line (LINE message style) down to following containers", () => {
    const text = "BL: TESTBL0000708\nเลขตู้ : ABCU1234560 10.9 ตัน B4\nXYZU7654323\nBL : BLTEST2025\nDEMU1000026";
    const r = parsePlanText(text, { ports });
    expect(r.map((x) => [x.container_no, x.bl_no])).toEqual([
      ["ABCU1234560", "TESTBL0000708"],
      ["XYZU7654323", "TESTBL0000708"],
      ["DEMU1000026", "BLTEST2025"],
    ]);
    expect(r[0].weight_kg).toBe(10900);
    expect(r[0].port).toBe("B4");
  });

  it("flags bad check digits and duplicates", () => {
    const r = parsePlanText("CSQU3054384\nCSQU3054383\nCSQU3054383", { ports });
    expect(r[0].warnings).toContain("check-digit");
    expect(r[2].warnings).toContain("duplicate");
  });
});

// ---------------------------------------------------------------------------
describe("status", () => {
  it("derives job status from fields", () => {
    expect(jobStatus(job())).toBe("unassigned");
    expect(jobStatus(job({ driver_id: "D1" }))).toBe("assigned");
    expect(jobStatus(job({ driver_id: "D1", pickup_date: D }))).toBe("running");
    expect(jobStatus(job({ driver_id: "D1", pickup_date: D, end_date: D }))).toBe("done");
    expect(jobStatus(job({ cancelled: true }))).toBe("cancelled");
  });

  it("raises container-return alerts", () => {
    expect(returnAlert(job({ return_due_date: "2026-11-17" }), D)).toMatchObject({ level: "overdue", days: 1 });
    expect(returnAlert(job({ return_due_date: "2026-11-19" }), D)).toMatchObject({ level: "due-soon", days: 1 });
    expect(returnAlert(job({ return_due_date: "2026-11-25" }), D)).toBeNull();
    expect(returnAlert(job({ return_due_date: "2026-11-17", return_date: "2026-11-17" }), D)).toBeNull();
    expect(returnAlert(job({ return_due_date: "2026-11-17", return_date: "2026-11-18" }), D)).toMatchObject({ level: "returned-late", days: 1 });
  });
});

// ---------------------------------------------------------------------------
describe("driverDayStatus", () => {
  const d1 = driver({ id: "D1" });

  it("is free with no jobs or leave", () => {
    expect(driverDayStatus(d1, D, [], []).state).toBe("free");
  });

  it("is busy when already holding a job on the same plan date", () => {
    const j = job({ driver_id: "D1" });
    const s = driverDayStatus(d1, D, [j], []);
    expect(s.state).toBe("busy");
    expect(s.jobs.map((x) => x.id)).toEqual([j.id]);
  });

  it("ignores the job being re-assigned and cancelled jobs", () => {
    const j = job({ driver_id: "D1" });
    expect(driverDayStatus(d1, D, [j], [], j.id).state).toBe("free");
    expect(driverDayStatus(d1, D, [job({ driver_id: "D1", cancelled: true })], []).state).toBe("free");
  });

  it("is running while a picked-up job has not ended", () => {
    const j = job({ driver_id: "D1", plan_date: "2026-11-16", pickup_date: "2026-11-16" });
    expect(driverDayStatus(d1, D, [j], []).state).toBe("running");
  });

  it("is free once an earlier job has ended", () => {
    const j = job({ driver_id: "D1", plan_date: "2026-11-16", pickup_date: "2026-11-16", end_date: "2026-11-17" });
    expect(driverDayStatus(d1, D, [j], []).state).toBe("free");
  });

  it("is off during an unavailability window (inclusive, open ends allowed)", () => {
    const leave = (s: string | null, e: string | null): Unavailability => ({ id: "u", driver_id: "D1", start_date: s, end_date: e, note: "ซ่อมรถ" });
    expect(driverDayStatus(d1, D, [], [leave("2026-11-17", "2026-11-18")]).state).toBe("off");
    expect(driverDayStatus(d1, D, [], [leave("2026-11-19", "2026-11-20")]).state).toBe("free");
    expect(driverDayStatus(d1, D, [], [leave("2026-11-10", null)]).state).toBe("off");
    expect(driverDayStatus(d1, D, [], [leave(null, D)]).state).toBe("off");
    expect(driverDayStatus(d1, D, [], [leave(null, "2026-11-17")]).state).toBe("free");
  });

  it("is off when inactive", () => {
    expect(driverDayStatus(driver({ id: "D9", active: false }), D, [], []).state).toBe("off");
  });
});

// ---------------------------------------------------------------------------
describe("autoAssign", () => {
  const company1 = driver({ id: "C1", truck_type: "company" });
  const company2 = driver({ id: "C2", truck_type: "company" });
  const partnerA = driver({ id: "P1", job_class: "เบาและหนัก" });
  const partnerB = driver({ id: "P2", job_class: "เบา" });
  const pickupTruck = driver({ id: "P3", job_class: "กะบะตู้ทึบ" });

  it("fills company trucks first, then partners by longest idle, and reports shortage", () => {
    const jobs = [job(), job(), job(), job(), job()];
    const lastJob = new Map([
      ["C1", "2026-11-10"],
      ["C2", "2026-11-01"],
      ["P1", "2026-11-15"],
      ["P2", "2026-11-05"],
    ]);
    const r = autoAssign({
      date: D,
      targets: jobs,
      drivers: [partnerA, partnerB, company1, company2, pickupTruck],
      allJobs: jobs,
      leaves: [],
      lastJobDate: lastJob,
    });
    expect(r.assignments.map((a) => a.driverId)).toEqual(["C2", "C1", "P2", "P1"]);
    expect(r.shortage).toBe(1);
  });

  it("skips drivers who are busy, running, or off", () => {
    const other = job({ driver_id: "C1" });
    const target = job();
    const r = autoAssign({
      date: D,
      targets: [target],
      drivers: [company1, company2, partnerA],
      allJobs: [other, target],
      leaves: [{ id: "u", driver_id: "C2", start_date: D, end_date: D, note: null }],
      lastJobDate: new Map(),
    });
    expect(r.assignments).toEqual([{ jobId: target.id, driverId: "P1" }]);
  });

  it("gives heavy containers to drivers who accept heavy loads first", () => {
    const light = job({ weight_doc_kg: 9000 });
    const heavy = job({ weight_doc_kg: 25000 });
    const r = autoAssign({
      date: D,
      targets: [light, heavy],
      drivers: [partnerB, partnerA],
      allJobs: [light, heavy],
      leaves: [],
      lastJobDate: new Map([["P2", "2026-11-01"], ["P1", "2026-11-02"]]),
      heavyTons: 20,
    });
    expect(r.assignments).toEqual(
      expect.arrayContaining([
        { jobId: heavy.id, driverId: "P1" },
        { jobId: light.id, driverId: "P2" },
      ]),
    );
  });

  it("ranks drivers for a picker: free first (company before partner), then busy, then off", () => {
    const busyJob = job({ driver_id: "P1" });
    const ranked = rankDrivers({
      date: D,
      drivers: [partnerA, partnerB, company1],
      allJobs: [busyJob],
      leaves: [{ id: "u", driver_id: "C1", start_date: D, end_date: D, note: null }],
      lastJobDate: new Map(),
    });
    expect(ranked.map((r) => [r.driver.id, r.status.state])).toEqual([
      ["P2", "free"],
      ["P1", "busy"],
      ["C1", "off"],
    ]);
  });
});

// ---------------------------------------------------------------------------
describe("pricing", () => {
  const rates: Rate[] = [
    { id: "1", destination: "MSFZ", truck_type: "company", max_tons: null, price: 16000 },
    { id: "2", destination: "MSFZ", truck_type: "partner", max_tons: null, price: 20000 },
    { id: "3", destination: "ระนอง", truck_type: "any", max_tons: 20, price: 26500 },
    { id: "4", destination: "ระนอง", truck_type: "any", max_tons: null, price: 27000 },
  ];

  it("picks the rate for destination + truck type", () => {
    expect(suggestPrice(rates, { destination: "MSFZ", truckType: "company", weightKg: 12000 })).toBe(16000);
    expect(suggestPrice(rates, { destination: "MSFZ", truckType: "partner", weightKg: 12000 })).toBe(20000);
  });

  it("uses the first weight tier that fits", () => {
    expect(suggestPrice(rates, { destination: "ระนอง", truckType: "partner", weightKg: 19500 })).toBe(26500);
    expect(suggestPrice(rates, { destination: "ระนอง", truckType: "partner", weightKg: 20400 })).toBe(27000);
  });

  it("returns null without a matching rate", () => {
    expect(suggestPrice(rates, { destination: "แม่สาย", truckType: "partner", weightKg: 1 })).toBeNull();
  });

  it("withholds 1% for partner trucks (price + overweight + overnight) and nothing for company trucks", () => {
    const j = job({ price: 20000, overweight_fee: 500, overnight_fee: 0, other_fee: 300 });
    expect(computeMoney(j, "partner")).toEqual({ gross: 20800, whTax: 205, net: 20595 });
    expect(computeMoney(j, "company")).toEqual({ gross: 20800, whTax: 0, net: 20800 });
  });

  it("respects a stored WH tax override", () => {
    expect(computeMoney(job({ price: 20000, wh_tax: 0 }), "partner")).toEqual({ gross: 20000, whTax: 0, net: 20000 });
  });
});

// ---------------------------------------------------------------------------
describe("messages", () => {
  const j = job({
    bl_no: "TESTBL0000708",
    container_no: "ABCU1234560",
    driver_id: "D5",
    driver_name: "วิชัย ทดสอบ",
    truck_no: "70-1001 ตาก - 70-1002 ตาก",
    phone: "080-000-1234",
    port: "C3",
    weight_actual_kg: 10900,
    price: 16000,
    bank: "กสิกรไทย",
    account_no: "000-0-00000-1",
    account_name: "วิชัย ทดสอบ",
  });

  it("builds the driver dispatch message (จ่ายงาน)", () => {
    expect(buildMessage("dispatch", [j], { truckTypeOf: () => "company" })).toBe(
      [
        "BL : TESTBL0000708",
        "เลขตู้ : ABCU1234560",
        "ประเภทงาน : MSFZ - รถยนต์เก่า",
        "น้ำหนักรวมตู้คอนเทนเนอร์ : 10,900",
        "ต้นทางปล่อยตู้ : C3",
        "ปลายทาง : MSFZ",
        "ค่าบริการ : 16,000",
        "ชื่อพขร : วิชัย ทดสอบ",
        "ทะเบียน : 70-1001 ตาก - 70-1002 ตาก",
        "โทรศัพท์ : 080-000-1234",
      ].join("\n"),
    );
  });

  it("builds the accounting withdrawal message (ตั้งเบิก) with net transfer", () => {
    const text = buildMessage("withdraw", [j], { truckTypeOf: () => "partner" });
    expect(text).toContain("ยอดโอน : 15,840");
    expect(text).toContain("เลขบัญชี : 000-0-00000-1");
  });

  it("separates multiple jobs with a blank line", () => {
    const text = buildMessage("summary", [j, { ...j, id: "x", container_no: "XYZU7654323" }], { truckTypeOf: () => "company" });
    expect(text.split("\n\n")).toHaveLength(2);
  });

  it("builds a truck request for unassigned containers", () => {
    const text = buildMessage("need-trucks", [job({ port: "D1" }), job({ port: "D1", weight_doc_kg: 21000 })], {
      truckTypeOf: () => "partner",
      date: D,
    });
    expect(text).toContain("ต้องการรถ 2 คัน");
    expect(text).toContain("18 พ.ย. 69");
  });
});

// ---------------------------------------------------------------------------
import { assignmentPatch, payeeTypeOf } from "./assign";

describe("assignmentPatch", () => {
  const rates: Rate[] = [
    { id: "1", destination: "MSFZ", truck_type: "company", max_tons: null, price: 16000 },
    { id: "2", destination: "MSFZ", truck_type: "partner", max_tons: null, price: 20000 },
  ];

  it("copies driver details and suggests a price", () => {
    const d = driver({ id: "C1", truck_type: "company", name: "สมชาย ตัวอย่าง", account_name: "สมชาย ตัวอย่าง" });
    expect(assignmentPatch(job(), d, rates)).toMatchObject({
      driver_id: "C1",
      driver_name: "สมชาย ตัวอย่าง",
      truck_no: d.truck_no,
      phone: d.phone,
      bank: d.bank,
      account_no: d.account_no,
      account_name: "สมชาย ตัวอย่าง",
      payee_type: "บุคคล",
      price: 16000,
    });
  });

  it("keeps a manually typed price", () => {
    const d = driver({ id: "P1" });
    expect(assignmentPatch(job({ price: 18000, price_manual: true }), d, rates).price).toBe(18000);
  });

  it("clears the driver and the auto price on unassign", () => {
    const p = assignmentPatch(job({ driver_id: "P1", price: 20000 }), null, rates);
    expect(p).toMatchObject({ driver_id: null, driver_name: null, truck_no: null, price: null });
  });

  it("detects juristic payees from the account name", () => {
    expect(payeeTypeOf("บจก.ตัวอย่างโลจิสติกส์")).toBe("นิติบุคคล");
    expect(payeeTypeOf("หจก.สาธิต ทรานสปอร์ต")).toBe("นิติบุคคล");
    expect(payeeTypeOf("บริษัท ทดสอบ เอ็กเพรส จำกัด")).toBe("นิติบุคคล");
    expect(payeeTypeOf("สมชาย ใจดี")).toBe("บุคคล");
  });
});
