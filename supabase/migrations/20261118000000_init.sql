-- ERP-TTN: ระบบจัดการแพลนลากตู้ / คนขับรถ
-- Schema เริ่มต้น: คนขับ, วันไม่ว่างของคนขับ, แพลน, งานลากตู้ (1 แถว = 1 ตู้), อัตราค่าขนส่ง, ตัวเลือก dropdown

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- drivers (DriverMaster + ประเภทที่รับงาน จาก Queue)
-- ---------------------------------------------------------------------------
create table public.drivers (
  id            text primary key,                 -- D001
  peak_code     text,
  name          text not null,
  truck_no      text,
  truck_type    text not null default 'partner'
                check (truck_type in ('company', 'partner')),   -- บริษัท / รถนอก(รถร่วม)
  phone         text,
  account_name  text,
  bank          text,
  account_no    text,
  fleet         text,                             -- สังกัด / หมายเหตุ (เจ้าของรถร่วม)
  job_class     text,                             -- เบา / เบาและหนัก / หนัก / กะบะตู้ทึบ
  doc_note      text,                             -- เอกสาร พขร.
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger drivers_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- driver_unavailability (งานนอก / ลา / รถซ่อม)
-- ---------------------------------------------------------------------------
create table public.driver_unavailability (
  id          uuid primary key default gen_random_uuid(),
  driver_id   text not null references public.drivers(id) on delete cascade,
  start_date  date,
  end_date    date,
  note        text,
  legacy_key  text unique,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index driver_unavailability_driver_idx on public.driver_unavailability (driver_id);

-- ---------------------------------------------------------------------------
-- plans (หนึ่งครั้งที่นำเข้าแพลนจาก partner)
-- ---------------------------------------------------------------------------
create table public.plans (
  id           uuid primary key default gen_random_uuid(),
  plan_date    date not null,
  customer     text,
  shipping     text,
  source_text  text,                              -- ข้อความ/ตารางต้นฉบับที่วางมา
  note         text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- jobs (WorkLog: 1 แถว = 1 ตู้)
-- ---------------------------------------------------------------------------
create table public.jobs (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid references public.plans(id) on delete set null,
  plan_date         date not null,
  customer          text,
  bl_no             text,
  container_no      text not null,
  weight_doc_kg     numeric(12,2),
  weight_actual_kg  numeric(12,2),
  port              text,                         -- เลขท่าเรือ / ต้นทางปล่อยตู้
  destination       text,
  job_type          text,
  shipping          text,

  -- คนขับ (เก็บสำเนาข้อมูล ณ ตอนจัดรถ เพื่อให้เอกสารจ่ายเงินไม่เปลี่ยนตามภายหลัง)
  driver_id         text references public.drivers(id) on delete set null,
  driver_name       text,
  truck_no          text,
  phone             text,
  payee_type        text check (payee_type in ('บุคคล', 'นิติบุคคล')),
  account_name      text,
  bank              text,
  account_no        text,

  pickup_date       date,                         -- วันที่รับตู้คอนเทนเนอร์
  end_date          date,                         -- วันที่จบงาน
  return_due_date   date,                         -- วันที่ต้องคืนตู้
  return_date       date,                         -- วันที่คืนตู้จริง

  -- ค่าใช้จ่าย ชำระครั้งที่ 1
  price             numeric(12,2),                -- ราคารถขนส่ง (ค่าเที่ยว)
  price_manual      boolean not null default false,
  overweight_fee    numeric(12,2),                -- ค่าน้ำหนักเกิน
  overnight_fee     numeric(12,2),                -- ค่าค้างคืน
  other_fee         numeric(12,2),                -- อื่น ๆ
  wh_tax            numeric(12,2),                -- WH Tax (null = คำนวณอัตโนมัติ)
  -- ค่าใช้จ่าย ชำระครั้งที่ 2
  overweight_fee_2  numeric(12,2),
  demurrage_fee     numeric(12,2),                -- ค่าตกค้าง
  late_return_fee   numeric(12,2),                -- ค่าคืนตู้ล่าช้า
  cleaning_fee      numeric(12,2),                -- Cleaning/Repair/อื่นๆ
  wh_tax_2          numeric(12,2),
  -- เอกสาร
  doc_certified     boolean not null default false,  -- รับรองสำเนาถูกต้อง
  doc_50tawi        boolean not null default false,  -- รับ 50ทวิ
  doc_tax_invoice   boolean not null default false,  -- ใบกำกับภาษี

  note              text,
  cancelled         boolean not null default false,
  legacy_key        text unique,                  -- กุญแจจากการนำเข้า Google Sheet
  created_by        uuid default auth.uid(),
  updated_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index jobs_plan_date_idx on public.jobs (plan_date);
create index jobs_driver_idx on public.jobs (driver_id);
create index jobs_container_idx on public.jobs (container_no);
create index jobs_open_idx on public.jobs (pickup_date) where end_date is null;
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rates (อัตราค่าขนส่ง ใช้แนะนำราคาตอนจัดรถ)
-- ---------------------------------------------------------------------------
create table public.rates (
  id           uuid primary key default gen_random_uuid(),
  destination  text not null,
  truck_type   text not null default 'any'
               check (truck_type in ('company', 'partner', 'any')),
  max_tons     numeric(8,2),                      -- null = ไม่จำกัด
  price        numeric(12,2) not null,
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- lookups (ตัวเลือก dropdown)
-- ---------------------------------------------------------------------------
create table public.lookups (
  kind   text not null check (kind in ('destination', 'job_type', 'port', 'shipping')),
  value  text not null,
  sort   int  not null default 0,
  primary key (kind, value)
);

insert into public.lookups (kind, value, sort) values
  ('destination', 'MSFZ', 1),
  ('destination', 'ท่า 18 แม่สอด', 2),
  ('destination', 'ท่าข้ามอื่น ๆ', 3),
  ('destination', 'สะพาน 2', 4),
  ('destination', 'ระนอง', 5),
  ('destination', 'แม่สาย', 6),
  ('destination', 'เชียงแสน', 7),
  ('destination', 'ด่านสังขละบุรี', 8),
  ('destination', 'ฟรีโซนปลาวาฬ', 9),
  ('job_type', 'MSFZ - รถยนต์เก่า', 1),
  ('job_type', 'MSFZ - Touch&Go', 2),
  ('job_type', 'MSFZ - งาน Roro', 3),
  ('job_type', 'MSFZ - งานสนามบิน', 4),
  ('job_type', 'MSFZ - แร่พลวง', 5),
  ('job_type', 'สินค้าทั่วไป', 6),
  ('port', 'A0', 1), ('port', 'A2', 2), ('port', 'B2', 3), ('port', 'B3', 4),
  ('port', 'B4', 5), ('port', 'B5', 6), ('port', 'C1', 7), ('port', 'C2', 8),
  ('port', 'C1C2', 9), ('port', 'C3', 10), ('port', 'D1', 11), ('port', 'KERRY', 12),
  ('port', 'OOCL', 13),
  ('shipping', 'KOLA SHIPPING', 1);

-- ---------------------------------------------------------------------------
-- driver_stats: วันที่มีงานล่าสุดของคนขับ (ใช้จัดคิว ใครว่างนานสุดได้ก่อน)
-- ---------------------------------------------------------------------------
create view public.driver_stats with (security_invoker = on) as
select
  driver_id,
  max(coalesce(end_date, pickup_date, plan_date)) as last_job_date,
  count(*)::int as job_count
from public.jobs
where driver_id is not null and not cancelled
group by driver_id;

-- ---------------------------------------------------------------------------
-- Row Level Security: ต้องล็อกอินเท่านั้นจึงอ่าน/เขียนได้
-- ---------------------------------------------------------------------------
alter table public.drivers               enable row level security;
alter table public.driver_unavailability enable row level security;
alter table public.plans                 enable row level security;
alter table public.jobs                  enable row level security;
alter table public.rates                 enable row level security;
alter table public.lookups               enable row level security;

create policy "staff full access" on public.drivers
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.driver_unavailability
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.plans
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.jobs
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.rates
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.lookups
  for all to authenticated using (true) with check (true);

revoke all on public.drivers, public.driver_unavailability, public.plans,
  public.jobs, public.rates, public.lookups, public.driver_stats from anon;
grant select, insert, update, delete on public.drivers, public.driver_unavailability,
  public.plans, public.jobs, public.rates, public.lookups to authenticated;
grant select on public.driver_stats to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: หลายคนเปิดหน้าจัดรถพร้อมกันเห็นการเปลี่ยนแปลงทันที
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.jobs, public.drivers, public.driver_unavailability;
