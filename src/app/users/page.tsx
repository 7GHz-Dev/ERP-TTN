import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEMO } from "@/lib/demo";
import type { Role } from "@/lib/auth/roles";
import { UsersTable, type UserRow } from "./UsersTable";

export const metadata = { title: "จัดการผู้ใช้ · TTN แพลนลากตู้" };

export default async function UsersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.active || me.role !== "admin") redirect("/");

  let rows: UserRow[] = [];
  let loadError: string | null = DEMO ? "โหมดสาธิตจัดการผู้ใช้ไม่ได้" : null;
  if (!DEMO) try {
    const sb = supabaseAdmin();
    const [profiles, users] = await Promise.all([
      sb.from("profiles").select("id,username,display_name,role,active").order("username"),
      sb.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    if (profiles.error) throw new Error(profiles.error.message);
    if (users.error) throw new Error(users.error.message);
    const lastSignIn = new Map(users.data.users.map((u) => [u.id, u.last_sign_in_at ?? null]));
    rows = profiles.data.map((p) => ({
      id: p.id as string,
      username: p.username as string,
      displayName: p.display_name as string,
      role: p.role as Role,
      active: p.active as boolean,
      lastSignIn: lastSignIn.get(p.id as string) ?? null,
    }));
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return <UsersTable rows={rows} meId={me.id} loadError={loadError} />;
}
