/** บทบาทผู้ใช้และสิทธิ์ — ต้องตรงกับ policy ใน supabase/migrations/20261126000000_user_roles.sql */

export type Role = "admin" | "planner" | "readiness";

export const ROLES: Role[] = ["admin", "planner", "readiness"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "ผู้ดูแลระบบ",
  planner: "จัดรถ-ประสานงาน",
  readiness: "ตรวจความพร้อม",
};

export type Action =
  | "plan.edit" // นำเข้าแพลน จัดรถ แก้ราคา เปลี่ยนสถานะ ลบตู้
  | "driver.add" // เพิ่มคนขับรถร่วม
  | "driver.edit" // แก้ข้อมูลคนขับ
  | "leave.edit" // แจ้ง/ลบวันไม่ว่าง
  | "rates.edit"
  | "lookups.edit"
  | "users.manage";

const ALLOWED: Record<Action, Role[]> = {
  "plan.edit": ["admin", "planner"],
  "driver.add": ["admin", "planner"],
  "driver.edit": ["admin", "planner", "readiness"],
  "leave.edit": ["admin", "planner", "readiness"],
  "rates.edit": ["admin", "planner"],
  "lookups.edit": ["admin"],
  "users.manage": ["admin"],
};

export function can(role: Role | null, action: Action): boolean {
  return role !== null && ALLOWED[action].includes(role);
}

/** Supabase Auth ต้องใช้อีเมล — ชื่อผู้ใช้จึงถูกแปลงเป็นอีเมลภายในที่ไม่มีใครส่งเมลถึง */
export const INTERNAL_EMAIL_DOMAIN = "users.ttn.internal";

export const normalizeUsername = (s: string) => s.trim().toLowerCase();

export const isValidUsername = (s: string) => /^[a-z0-9._-]{2,32}$/.test(normalizeUsername(s));

export const usernameToEmail = (u: string) => `${normalizeUsername(u)}@${INTERNAL_EMAIL_DOMAIN}`;

/** ช่องล็อกอินรับได้ทั้งชื่อผู้ใช้และอีเมล */
export const loginIdToEmail = (id: string) => (id.includes("@") ? id.trim().toLowerCase() : usernameToEmail(id));

export interface ProfileLite {
  id: string;
  role: Role;
  active: boolean;
}

/** ตรวจการเปลี่ยนบทบาท/สถานะก่อนบันทึก — คืนข้อความผิดพลาด หรือ null ถ้าทำได้ */
export function guardAdminChange(
  all: ProfileLite[],
  actorId: string,
  targetId: string,
  next: { role?: Role; active?: boolean },
): string | null {
  const target = all.find((p) => p.id === targetId);
  if (actorId === targetId) {
    if (next.role !== undefined && next.role !== target?.role) return "เปลี่ยนบทบาทของตัวเองไม่ได้";
    if (next.active === false) return "ปิดบัญชีของตัวเองไม่ได้";
  }
  if (target?.role === "admin" && target.active) {
    const losesAdmin = (next.role !== undefined && next.role !== "admin") || next.active === false;
    const others = all.filter((p) => p.id !== targetId && p.role === "admin" && p.active).length;
    if (losesAdmin && others === 0) return "ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน";
  }
  return null;
}

/** ผู้ใช้ที่ล็อกอินอยู่ (อ่านฝั่ง server แล้วส่งให้หน้าจอ) */
export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: Role | null;
  active: boolean;
}
