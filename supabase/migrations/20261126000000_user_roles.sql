-- ระบบผู้ใช้และบทบาท: admin / planner (จัดรถ-ประสานงาน) / readiness (ตรวจความพร้อม)
-- แทน policy "staff full access" ด้วยสิทธิ์ตามบทบาท — ต้องตรงกับ src/lib/auth/roles.ts
-- รันซ้ำได้

-- ---------------------------------------------------------------------------
-- profiles: 1 แถวต่อผู้ใช้ใน auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9._-]{2,32}$'),
  display_name  text not null,
  role          text not null check (role in ('admin', 'planner', 'readiness')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- บทบาทของผู้ใช้ที่ล็อกอินอยู่ (null = ไม่มีบัญชีในระบบ หรือถูกปิด)
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active
$$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated, service_role;

-- ผู้ใช้เดิม (สร้างใน Supabase dashboard ก่อนมีระบบนี้) เป็น admin ทั้งหมด
insert into public.profiles (id, username, display_name, role)
select
  u.id,
  left(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9._-]', '', 'g'), 32),
  split_part(u.email, '@', 1),
  'admin'
from auth.users u
where u.email is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------
drop policy if exists "staff full access" on public.drivers;
drop policy if exists "staff full access" on public.driver_unavailability;
drop policy if exists "staff full access" on public.plans;
drop policy if exists "staff full access" on public.jobs;
drop policy if exists "staff full access" on public.rates;
drop policy if exists "staff full access" on public.lookups;

do $$
declare
  t text;
begin
  -- อ่านได้ทุกบทบาท
  foreach t in array array['drivers', 'driver_unavailability', 'plans', 'jobs', 'rates', 'lookups', 'profiles'] loop
    execute format('drop policy if exists "role read" on public.%I', t);
    execute format('create policy "role read" on public.%I for select to authenticated using (public.my_role() is not null)', t);
  end loop;

  -- แพลน/งาน/อัตรา: admin, planner
  foreach t in array array['plans', 'jobs', 'rates'] loop
    execute format('drop policy if exists "planner write" on public.%I', t);
    execute format(
      'create policy "planner write" on public.%I for all to authenticated '
      'using (public.my_role() in (''admin'', ''planner'')) with check (public.my_role() in (''admin'', ''planner''))', t);
  end loop;
end $$;

-- คนขับ: เพิ่ม/ลบ admin, planner · แก้ไขได้ทุกบทบาท
drop policy if exists "planner insert" on public.drivers;
drop policy if exists "planner delete" on public.drivers;
drop policy if exists "role update" on public.drivers;
create policy "planner insert" on public.drivers for insert to authenticated
  with check (public.my_role() in ('admin', 'planner'));
create policy "planner delete" on public.drivers for delete to authenticated
  using (public.my_role() in ('admin', 'planner'));
create policy "role update" on public.drivers for update to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);

-- วันไม่ว่าง: ทุกบทบาท
drop policy if exists "role write" on public.driver_unavailability;
create policy "role write" on public.driver_unavailability for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);

-- ตัวเลือก: admin
drop policy if exists "admin write" on public.lookups;
create policy "admin write" on public.lookups for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- profiles: ไม่มี policy เขียน — แก้ผ่าน server (คีย์ลับ) เท่านั้น
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
