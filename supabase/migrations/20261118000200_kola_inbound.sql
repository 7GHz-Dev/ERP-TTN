-- รับแพลนลากตู้จาก ERP KOLA (NAMKANG กด "สั่งลาก" ที่หน้า Transport Request)
--
-- KOLA เรียก RPC public.kola_receive_plan ด้วย publishable key + คีย์ลับของการเชื่อม (p_key)
-- ฟังก์ชันเป็น security definer จึงเขียนตารางได้โดยไม่ต้องเปิดสิทธิ์ตารางให้ anon
-- คีย์ลับเก็บเป็น sha256 ใน public.integration_keys (ไม่มี policy = ไม่มีใครอ่านผ่าน API ได้)
--
-- ตู้หนึ่งตู้ของ KOLA = jobs หนึ่งแถว ผูกด้วย source_ref (id ตู้ฝั่ง KOLA)
--   ส่งครั้งแรก        เพิ่มแถวใหม่ (รอจัดรถ)
--   ส่งซ้ำ / เปลี่ยนวัน  อัปเดตข้อมูลประกอบทุกครั้ง · เปลี่ยนวันแพลนและวันต้องคืนตู้ เฉพาะตู้ที่ยังไม่รับ
--                     ไม่แตะคนขับ ราคา หมายเหตุ ที่ทีมจัดรถใส่ไว้

create extension if not exists pgcrypto with schema extensions;

alter table public.jobs
  add column if not exists source          text,          -- KOLA = มาจาก ERP KOLA · ว่าง = นำเข้าเอง
  add column if not exists source_ref      text,          -- id ตู้ฝั่ง KOLA
  add column if not exists source_job_no   text,          -- เลขงาน KOLA
  add column if not exists shipper         text,
  add column if not exists shipline        text,          -- สายเรือ
  add column if not exists vessel          text,
  add column if not exists eta             date,
  add column if not exists eta_official    boolean,       -- ETA ยืนยันจากระบบกรมแล้ว
  add column if not exists do_status       text,          -- ข้อความสถานะ D/O จาก KOLA
  add column if not exists dem_free_until  date,          -- วันสุดท้ายของ free time DEM (ตู้อยู่ท่า)
  add column if not exists det_days        int,           -- free time DET (ตู้ออกจากท่าแล้วต้องคืนภายใน)
  add column if not exists bl_containers   int,           -- จำนวนตู้ทั้ง BL
  add column if not exists source_sent_at  timestamptz;

create unique index if not exists jobs_source_ref_key on public.jobs (source, source_ref);

create table if not exists public.integration_keys (
  name      text primary key,
  key_hash  text not null,
  created_at timestamptz not null default now()
);
alter table public.integration_keys enable row level security;
revoke all on public.integration_keys from anon, authenticated;

create or replace function public.kola_receive_plan(p_key text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r        jsonb;
  v_plan   uuid;
  v_id     uuid;
  v_picked date;
  v_new    int := 0;
  v_upd    int := 0;
  v_locked int := 0;
begin
  if p_key is null or not exists (
    select 1 from public.integration_keys k
     where k.name = 'KOLA' and k.key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex')
  ) then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('inserted', 0, 'updated', 0, 'locked', 0);
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'too many rows';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'source_ref', '') = '' or coalesce(r->>'container_no', '') = '' or coalesce(r->>'plan_date', '') = '' then
      raise exception 'row missing source_ref/container_no/plan_date';
    end if;

    select j.id, j.pickup_date into v_id, v_picked
      from public.jobs j where j.source = 'KOLA' and j.source_ref = r->>'source_ref';

    if v_id is null then
      if v_plan is null then
        insert into public.plans (plan_date, customer, shipping, note, created_by)
        values ((r->>'plan_date')::date, r->>'customer', r->>'shipping', 'สั่งลากจาก ERP KOLA', null)
        returning id into v_plan;
      end if;
      insert into public.jobs (
        plan_id, plan_date, customer, bl_no, container_no, weight_doc_kg, port, destination, job_type, shipping,
        return_due_date, created_by, updated_by,
        source, source_ref, source_job_no, shipper, shipline, vessel, eta, eta_official, do_status,
        dem_free_until, det_days, bl_containers, source_sent_at
      ) values (
        v_plan, (r->>'plan_date')::date, r->>'customer', r->>'bl_no', r->>'container_no',
        nullif(r->>'weight_doc_kg', '')::numeric, r->>'port', r->>'destination', r->>'job_type', r->>'shipping',
        nullif(r->>'return_due_date', '')::date, null, null,
        'KOLA', r->>'source_ref', r->>'source_job_no', r->>'shipper', r->>'shipline', r->>'vessel',
        nullif(r->>'eta', '')::date, (r->>'eta_official')::boolean, r->>'do_status',
        nullif(r->>'dem_free_until', '')::date, nullif(r->>'det_days', '')::int, nullif(r->>'bl_containers', '')::int, now()
      );
      v_new := v_new + 1;
    else
      update public.jobs j set
        shipper = r->>'shipper', shipline = r->>'shipline', vessel = r->>'vessel',
        eta = nullif(r->>'eta', '')::date, eta_official = (r->>'eta_official')::boolean,
        do_status = r->>'do_status', dem_free_until = nullif(r->>'dem_free_until', '')::date,
        det_days = nullif(r->>'det_days', '')::int, bl_containers = nullif(r->>'bl_containers', '')::int,
        source_job_no = r->>'source_job_no', source_sent_at = now(),
        bl_no = coalesce(r->>'bl_no', j.bl_no),
        weight_doc_kg = coalesce(nullif(r->>'weight_doc_kg', '')::numeric, j.weight_doc_kg),
        port = coalesce(nullif(r->>'port', ''), j.port),
        -- รับตู้ไปแล้ว วันแพลน/วันคืนตู้เป็นของจริงหน้างาน ไม่ทับ
        plan_date = case when v_picked is null then (r->>'plan_date')::date else j.plan_date end,
        return_due_date = case when v_picked is null then nullif(r->>'return_due_date', '')::date else j.return_due_date end,
        cancelled = case when v_picked is null then false else j.cancelled end
      where j.id = v_id;
      if v_picked is null then v_upd := v_upd + 1; else v_locked := v_locked + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_new, 'updated', v_upd, 'locked', v_locked);
end;
$$;

revoke all on function public.kola_receive_plan(text, jsonb) from public;
grant execute on function public.kola_receive_plan(text, jsonb) to anon, authenticated, service_role;
