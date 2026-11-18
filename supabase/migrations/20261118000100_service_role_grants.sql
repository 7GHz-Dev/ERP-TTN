-- service_role (secret key) ใช้กับสคริปต์นำเข้าข้อมูล / งานแอดมิน — ข้าม RLS แต่ต้องมีสิทธิ์ระดับตาราง
-- (โปรเจกต์ Supabase ใหม่ไม่ grant ให้ role ของ Data API อัตโนมัติ)
grant select, insert, update, delete on public.drivers, public.driver_unavailability,
  public.plans, public.jobs, public.rates, public.lookups to service_role;
grant select on public.driver_stats to service_role;
