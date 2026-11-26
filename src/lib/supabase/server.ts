import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL, assertSupabaseEnv } from "./env";

export async function supabaseServer() {
  // อ่าน cookies ก่อน: ทำให้หน้าเป็น dynamic เสมอ (ไม่ถูก prerender ตอน build แม้ยังไม่ได้ตั้งค่า env)
  const cookieStore = await cookies();
  assertSupabaseEnv();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // เรียกจาก Server Component ตั้ง cookie ไม่ได้ — proxy.ts รีเฟรช session ให้แล้ว
        }
      },
    },
  });
}
