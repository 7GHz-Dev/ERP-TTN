"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeUsername, usernameToEmail } from "@/lib/auth/roles";

/** ชื่อผู้ใช้ → อีเมลที่ใช้ใน Supabase Auth (บัญชีเดิมอาจเป็นอีเมลจริง ไม่ใช่อีเมลภายใน) */
async function emailFor(loginId: string): Promise<string> {
  const id = loginId.trim().toLowerCase();
  if (id.includes("@")) return id;
  const username = normalizeUsername(id);
  try {
    const sb = supabaseAdmin();
    const { data: p } = await sb.from("profiles").select("id").eq("username", username).maybeSingle();
    if (p) {
      const { data } = await sb.auth.admin.getUserById(p.id);
      if (data.user?.email) return data.user.email;
    }
  } catch {
    // ไม่มีคีย์ลับบน server: ใช้อีเมลภายในตามชื่อผู้ใช้
  }
  return usernameToEmail(username);
}

/** ล็อกอินฝั่ง server (ตั้ง cookie session ให้) — ข้อความผิดพลาดเดียวกันทุกกรณี ไม่บอกว่ามีชื่อผู้ใช้นี้หรือไม่ */
export async function signIn(loginId: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = await emailFor(loginId);
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (!error) return { ok: true };
  return { ok: false, error: /invalid login/i.test(error.message) ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" : error.message };
}
