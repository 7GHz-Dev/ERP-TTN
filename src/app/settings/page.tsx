import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEMO } from "@/lib/demo";
import { can, settingsTabs, type Role, type SettingsTab } from "@/lib/auth/roles";
import { SettingsShell } from "./SettingsShell";
import { UsersTable, type UserRow } from "./users/UsersTable";
import { LookupsTab } from "./LookupsTab";
import { RatesTab } from "./RatesTab";
import { DriversTab } from "./DriversTab";

export const metadata = { title: "ตั้งค่า · TTN แพลนลากตู้" };

async function loadUsers(): Promise<{ rows: UserRow[]; error: string | null }> {
  try {
    const sb = supabaseAdmin();
    const [profiles, users] = await Promise.all([
      sb.from("profiles").select("id,username,display_name,role,active").order("username"),
      sb.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    if (profiles.error) throw new Error(profiles.error.message);
    if (users.error) throw new Error(users.error.message);
    const lastSignIn = new Map(users.data.users.map((u) => [u.id, u.last_sign_in_at ?? null]));
    return {
      error: null,
      rows: profiles.data.map((p) => ({
        id: p.id as string,
        username: p.username as string,
        displayName: p.display_name as string,
        role: p.role as Role,
        active: p.active as boolean,
        lastSignIn: lastSignIn.get(p.id as string) ?? null,
      })),
    };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const tabs = me.active ? settingsTabs(me.role) : [];
  if (!tabs.length) redirect("/");
  const { tab } = await searchParams;
  const active: SettingsTab = tabs.includes(tab as SettingsTab) ? (tab as SettingsTab) : tabs[0];

  let content: React.ReactNode;
  if (DEMO) {
    content = <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">โหมดสาธิตไม่มีหน้าตั้งค่า</p>;
  } else if (active === "users") {
    const { rows, error } = await loadUsers();
    content = <UsersTable rows={rows} meId={me.id} loadError={error} />;
  } else if (active === "lookups") {
    content = <LookupsTab />;
  } else if (active === "rates") {
    content = <RatesTab />;
  } else {
    content = <DriversTab canAdd={can(me.role, "driver.add")} />;
  }

  return (
    <SettingsShell tabs={tabs} active={active}>
      {content}
    </SettingsShell>
  );
}
