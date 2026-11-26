import { describe, expect, it } from "vitest";
import {
  ROLES,
  can,
  guardAdminChange,
  guardDelete,
  passwordError,
  authErrorText,
  settingsTabs,
  isValidUsername,
  loginIdToEmail,
  normalizeUsername,
  usernameToEmail,
  type Action,
  type ProfileLite,
} from "./roles";

const ACTIONS: Action[] = ["plan.edit", "driver.add", "driver.edit", "leave.edit", "rates.edit", "lookups.edit", "users.manage"];

describe("can", () => {
  it("readiness ดูแลความพร้อมได้ แต่แก้แพลนไม่ได้", () => {
    expect(can("readiness", "plan.edit")).toBe(false);
    expect(can("readiness", "driver.add")).toBe(false);
    expect(can("readiness", "leave.edit")).toBe(true);
    expect(can("readiness", "driver.edit")).toBe(true);
  });
  it("planner แก้อัตราได้ แต่แก้ตัวเลือกและผู้ใช้ไม่ได้", () => {
    expect(can("planner", "plan.edit")).toBe(true);
    expect(can("planner", "rates.edit")).toBe(true);
    expect(can("planner", "lookups.edit")).toBe(false);
    expect(can("planner", "users.manage")).toBe(false);
  });
  it("admin ทำได้ทุกอย่าง ไม่มีบทบาททำไม่ได้เลย", () => {
    for (const a of ACTIONS) {
      expect(can("admin", a)).toBe(true);
      expect(can(null, a)).toBe(false);
    }
  });
  it("ROLES มีครบ 3 บทบาท", () => {
    expect(ROLES).toEqual(["admin", "planner", "readiness"]);
  });
});

describe("ชื่อผู้ใช้", () => {
  it("แปลงเป็นตัวเล็กและตัดช่องว่าง", () => {
    expect(normalizeUsername("  AON ")).toBe("aon");
  });
  it("ตรวจรูปแบบ", () => {
    expect(isValidUsername("aon")).toBe(true);
    expect(isValidUsername("satang.k")).toBe(true);
    expect(isValidUsername("a")).toBe(false);
    expect(isValidUsername("ao n")).toBe(false);
    expect(isValidUsername("อร")).toBe(false);
  });
  it("แปลงเป็นอีเมลภายใน", () => {
    expect(usernameToEmail("AON")).toBe("aon@users.ttn.internal");
    expect(loginIdToEmail("satang")).toBe("satang@users.ttn.internal");
  });
  it("อีเมลจริงใช้ตามที่พิมพ์ (ตัวเล็ก)", () => {
    expect(loginIdToEmail(" Me@Gmail.com ")).toBe("me@gmail.com");
  });
});

describe("guardAdminChange", () => {
  const all: ProfileLite[] = [
    { id: "a1", role: "admin", active: true },
    { id: "p1", role: "planner", active: true },
    { id: "r1", role: "readiness", active: true },
  ];
  it("เปลี่ยนบทบาทของตัวเองไม่ได้", () => {
    expect(guardAdminChange(all, "a1", "a1", { role: "planner" })).toBe("เปลี่ยนบทบาทของตัวเองไม่ได้");
  });
  it("ปิดบัญชีของตัวเองไม่ได้", () => {
    expect(guardAdminChange(all, "a1", "a1", { active: false })).toBe("ปิดบัญชีของตัวเองไม่ได้");
  });
  it("ต้องเหลือ admin ที่ใช้งานอยู่อย่างน้อย 1 คน", () => {
    const two: ProfileLite[] = [...all, { id: "a2", role: "admin", active: true }];
    // a2 ลด a1 → ยังเหลือ a2 ได้
    expect(guardAdminChange(two, "a2", "a1", { role: "planner" })).toBeNull();
    // a1 ถูกปิดไปแล้ว: a2 คือ admin คนเดียว — p1 (สมมติว่าเป็นผู้เรียก) ลด a2 ไม่ได้
    const lone: ProfileLite[] = [{ id: "a1", role: "admin", active: false }, { id: "a2", role: "admin", active: true }, all[1]];
    expect(guardAdminChange(lone, "p1", "a2", { active: false })).toBe("ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน");
    expect(guardAdminChange(lone, "p1", "a2", { role: "readiness" })).toBe("ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน");
  });
  it("เปลี่ยนบทบาทคนอื่นที่ไม่ใช่ admin ได้", () => {
    expect(guardAdminChange(all, "a1", "p1", { role: "readiness" })).toBeNull();
    expect(guardAdminChange(all, "a1", "r1", { active: false })).toBeNull();
  });
});

describe("settingsTabs", () => {
  it("แต่ละบทบาทเห็นแท็บตามสิทธิ์", () => {
    expect(settingsTabs("admin")).toEqual(["users", "lookups", "rates", "drivers"]);
    expect(settingsTabs("planner")).toEqual(["rates", "drivers"]);
    expect(settingsTabs("readiness")).toEqual(["drivers"]);
    expect(settingsTabs(null)).toEqual([]);
  });
});

describe("guardDelete", () => {
  const all: ProfileLite[] = [
    { id: "a1", role: "admin", active: true },
    { id: "a2", role: "admin", active: false },
    { id: "p1", role: "planner", active: true },
  ];
  it("ลบบัญชีของตัวเองไม่ได้", () => {
    expect(guardDelete(all, "a1", "a1")).toBe("ลบบัญชีของตัวเองไม่ได้");
  });
  it("ลบ admin ที่ใช้งานอยู่คนสุดท้ายไม่ได้", () => {
    expect(guardDelete(all, "p1", "a1")).toBe("ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน");
  });
  it("ลบคนอื่นได้ (รวม admin ที่ถูกปิด)", () => {
    expect(guardDelete(all, "a1", "p1")).toBeNull();
    expect(guardDelete(all, "a1", "a2")).toBeNull();
  });
});

describe("passwordError", () => {
  it("ห้ามว่าง แต่ไม่จำกัดความยาวขั้นต่ำ", () => {
    expect(passwordError("")).toBe("กรอกรหัสผ่าน");
    expect(passwordError("1")).toBeNull();
    expect(passwordError("1234")).toBeNull();
  });
});

describe("authErrorText", () => {
  it("แปลข้อความขั้นต่ำของ Supabase เป็นภาษาไทย", () => {
    expect(authErrorText("Password should be at least 6 characters.")).toBe(
      "Supabase กำหนดรหัสผ่านอย่างน้อย 6 ตัว (ปรับได้ที่ Supabase → Authentication → Providers → Email → Minimum password length)",
    );
  });
  it("ข้อความอื่นคืนตามเดิม", () => {
    expect(authErrorText("User not found")).toBe("User not found");
  });
});
