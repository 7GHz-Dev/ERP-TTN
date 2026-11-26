/**
 * ตรวจสิทธิ์ตามบทบาทกับฐานข้อมูลจริง (RLS)
 *
 *   npm run check-rls
 *
 * สร้างผู้ใช้ทดสอบ 4 คน (admin / planner / readiness / ถูกปิด) ล็อกอินด้วย publishable key
 * แล้วลองอ่าน/เขียนตาราง เทียบกับที่คาด จากนั้นลบผู้ใช้ทดสอบทิ้งเสมอ
 * ต้องมีใน .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
 */
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { usernameToEmail, type Role } from "../src/lib/auth/roles";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !pub || !secret)
  throw new Error("ตั้งค่า NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY ใน .env.local");
const admin = createClient(url, secret, { auth: { persistSession: false } });

type Check = "อ่านงาน" | "แก้งาน" | "วันไม่ว่าง" | "แก้ตัวเลือก";
const CHECKS: Check[] = ["อ่านงาน", "แก้งาน", "วันไม่ว่าง", "แก้ตัวเลือก"];
const CASES: { name: string; role: Role; active: boolean; expect: boolean[] }[] = [
  { name: "rls-admin", role: "admin", active: true, expect: [true, true, true, true] },
  { name: "rls-planner", role: "planner", active: true, expect: [true, true, true, false] },
  { name: "rls-readiness", role: "readiness", active: true, expect: [true, false, true, false] },
  { name: "rls-off", role: "planner", active: false, expect: [false, false, false, false] },
];

async function tryAll(sb: SupabaseClient): Promise<boolean[]> {
  const { data: sample } = await admin.from("jobs").select("id,note").limit(1).single();
  const { data: lookup } = await admin.from("lookups").select("kind,value,sort").limit(1).single();
  const { data: driver } = await admin.from("drivers").select("id").limit(1).single();
  if (!sample || !lookup || !driver) throw new Error("ต้องมีข้อมูล jobs / lookups / drivers อย่างน้อยอย่างละ 1 แถว");

  const read = await sb.from("jobs").select("id").limit(1);
  const canRead = !read.error && (read.data?.length ?? 0) > 0;

  // แก้แล้วคืนค่าเดิมด้วยคีย์ลับ
  const upd = await sb.from("jobs").update({ note: sample.note }).eq("id", sample.id).select("id");
  const canUpdate = !upd.error && (upd.data?.length ?? 0) > 0;

  const ins = await sb
    .from("driver_unavailability")
    .insert({ driver_id: driver.id, start_date: "2000-01-01", end_date: "2000-01-01", note: "rls-check" })
    .select("id");
  const canLeave = !ins.error && (ins.data?.length ?? 0) > 0;
  await admin.from("driver_unavailability").delete().eq("note", "rls-check");

  const lk = await sb.from("lookups").update({ sort: lookup.sort }).eq("kind", lookup.kind).eq("value", lookup.value).select("kind");
  const canLookup = !lk.error && (lk.data?.length ?? 0) > 0;

  return [canRead, canUpdate, canLeave, canLookup];
}

async function main() {
  const created: string[] = [];
  let failed = false;
  try {
    for (const c of CASES) {
      const password = randomBytes(18).toString("base64url");
      const old = await admin.from("profiles").select("id").eq("username", c.name).maybeSingle();
      if (old.data) await admin.auth.admin.deleteUser(old.data.id);
      const u = await admin.auth.admin.createUser({ email: usernameToEmail(c.name), password, email_confirm: true });
      if (u.error) throw new Error(`สร้าง ${c.name}: ${u.error.message}`);
      created.push(u.data.user.id);
      const p = await admin
        .from("profiles")
        .insert({ id: u.data.user.id, username: c.name, display_name: c.name, role: c.role, active: c.active });
      if (p.error) throw new Error(`profile ${c.name}: ${p.error.message}`);

      const sb = createClient(url!, pub!, { auth: { persistSession: false } });
      const s = await sb.auth.signInWithPassword({ email: usernameToEmail(c.name), password });
      if (s.error) throw new Error(`ล็อกอิน ${c.name}: ${s.error.message}`);
      const got = await tryAll(sb);
      const line = CHECKS.map((k, i) => `${k} ${got[i] ? "ได้" : "ไม่ได้"}${got[i] === c.expect[i] ? "" : " ✗(คาดว่า" + (c.expect[i] ? "ได้" : "ไม่ได้") + ")"}`);
      const ok = got.every((v, i) => v === c.expect[i]);
      if (!ok) failed = true;
      console.log(`${ok ? "✓" : "✗"} ${c.name.padEnd(14)} ${line.join(" · ")}`);
    }
  } finally {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  }
  console.log(failed ? "\nสิทธิ์ไม่ตรงตามที่คาด" : "\nสิทธิ์ตรงตามที่คาดทุกบทบาท");
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("ผิดพลาด:", e instanceof Error ? e.message : e);
  process.exit(1);
});
