import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo";
import type { CurrentUser, Role } from "./roles";

const DEMO_USER: CurrentUser = { id: "demo", username: "demo", displayName: "demo", role: "admin", active: true };

/** ผู้ใช้ที่ล็อกอินอยู่ — null = ยังไม่ได้ล็อกอิน; ไม่มี profile หรือถูกปิด = role null / active false */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (DEMO) return DEMO_USER;
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const email = (data.claims.email as string | undefined) ?? "";
  // RLS ให้อ่าน profiles ได้เฉพาะผู้ใช้ที่ active — อ่านไม่ได้ = ไม่มีสิทธิ์
  const { data: p } = await sb.from("profiles").select("username,display_name,role,active").eq("id", id).maybeSingle();
  if (!p) return { id, username: email.split("@")[0], displayName: email.split("@")[0], role: null, active: false };
  return { id, username: p.username, displayName: p.display_name, role: p.active ? (p.role as Role) : null, active: p.active };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u || !u.active || u.role !== "admin") throw new Error("ต้องเป็นผู้ดูแลระบบ");
  return u;
}
