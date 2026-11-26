import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/** client ด้วยคีย์ลับ (ข้าม RLS) — ใช้เฉพาะ Server Actions ที่ตรวจสิทธิ์ admin แล้ว */
export function supabaseAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) throw new Error("ยังไม่ได้ตั้งค่า SUPABASE_SECRET_KEY บน server (Vercel → Environment Variables)");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
