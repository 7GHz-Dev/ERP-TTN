"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ROLES,
  authErrorText,
  passwordError,
  guardAdminChange,
  guardDelete,
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
  type ProfileLite,
  type Role,
} from "@/lib/auth/roles";

export type Result = { ok: true } | { ok: false; error: string };

/** ทุก action: ตรวจว่าผู้เรียกเป็น admin จาก session ฝั่ง server ก่อน แล้วคืน error เป็นข้อความ */
async function run(fn: (actorId: string) => Promise<string | null>): Promise<Result> {
  try {
    const actor = await requireAdmin();
    const error = await fn(actor.id);
    if (error) return { ok: false, error };
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const roleError = (r: string) => (ROLES.includes(r as Role) ? null : "บทบาทไม่ถูกต้อง");

async function allProfiles(): Promise<ProfileLite[]> {
  const { data, error } = await supabaseAdmin().from("profiles").select("id,role,active");
  if (error) throw new Error(`อ่านผู้ใช้ไม่สำเร็จ: ${error.message}`);
  return data as ProfileLite[];
}

export async function createUser(input: { username: string; displayName: string; role: Role; password: string }): Promise<Result> {
  return run(async () => {
    const username = normalizeUsername(input.username);
    if (!isValidUsername(username)) return "ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 2–32 ตัว";
    const bad = roleError(input.role) ?? passwordError(input.password);
    if (bad) return bad;
    const sb = supabaseAdmin();
    const dup = await sb.from("profiles").select("id").eq("username", username).maybeSingle();
    if (dup.data) return "ชื่อผู้ใช้นี้มีแล้ว";

    const u = await sb.auth.admin.createUser({ email: usernameToEmail(username), password: input.password, email_confirm: true });
    if (u.error) return /already|exists|registered/i.test(u.error.message) ? "ชื่อผู้ใช้นี้มีแล้ว" : authErrorText(u.error.message);
    const p = await sb.from("profiles").insert({
      id: u.data.user.id,
      username,
      display_name: input.displayName.trim() || username,
      role: input.role,
    });
    if (p.error) {
      await sb.auth.admin.deleteUser(u.data.user.id);
      return `บันทึกผู้ใช้ไม่สำเร็จ: ${p.error.message}`;
    }
    return null;
  });
}

export async function updateProfile(id: string, input: { username: string; displayName: string }): Promise<Result> {
  return run(async () => {
    const username = normalizeUsername(input.username);
    if (!isValidUsername(username)) return "ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 2–32 ตัว";
    const sb = supabaseAdmin();
    const dup = await sb.from("profiles").select("id").eq("username", username).neq("id", id).maybeSingle();
    if (dup.data) return "ชื่อผู้ใช้นี้มีแล้ว";
    // อีเมลใน Auth ไม่เปลี่ยน — หน้าล็อกอินหาอีเมลจาก profiles.username
    const { error } = await sb.from("profiles").update({ username, display_name: input.displayName.trim() || username }).eq("id", id);
    return error ? error.message : null;
  });
}

export async function deleteUser(id: string): Promise<Result> {
  return run(async (actorId) => {
    const bad = guardDelete(await allProfiles(), actorId, id);
    if (bad) return bad;
    // profiles ลบตามด้วย on delete cascade · ประวัติงาน (created_by) ไม่มี FK จึงยังอยู่
    const { error } = await supabaseAdmin().auth.admin.deleteUser(id);
    return error ? error.message : null;
  });
}

export async function setRole(id: string, role: Role): Promise<Result> {
  return run(async (actorId) => {
    const bad = roleError(role) ?? guardAdminChange(await allProfiles(), actorId, id, { role });
    if (bad) return bad;
    const { error } = await supabaseAdmin().from("profiles").update({ role }).eq("id", id);
    return error ? error.message : null;
  });
}

export async function setActive(id: string, active: boolean): Promise<Result> {
  return run(async (actorId) => {
    const bad = guardAdminChange(await allProfiles(), actorId, id, { active });
    if (bad) return bad;
    const sb = supabaseAdmin();
    const { error } = await sb.from("profiles").update({ active }).eq("id", id);
    if (error) return error.message;
    // ban กัน session ใหม่ — session เดิมใช้ข้อมูลไม่ได้อยู่แล้วเพราะ RLS ดู active
    const ban = await sb.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
    return ban.error ? ban.error.message : null;
  });
}

export async function resetPassword(id: string, password: string): Promise<Result> {
  return run(async () => {
    const bad = passwordError(password);
    if (bad) return bad;
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password });
    return error ? authErrorText(error.message) : null;
  });
}
