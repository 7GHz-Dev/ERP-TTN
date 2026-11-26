# ระบบผู้ใช้และบทบาท — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** บัญชีผู้ใช้รายคน 3 บทบาท (admin / planner / readiness) ที่ฐานข้อมูลบังคับสิทธิ์ + หน้า `/users` ให้ admin จัดการผู้ใช้

**Architecture:** ตาราง `profiles` + ฟังก์ชัน `my_role()` ใช้ใน RLS ทุกตาราง; หน้าจออ่าน profile ฝั่ง server แล้วส่งบทบาทลงไปซ่อนปุ่ม; การจัดการผู้ใช้ทำใน Server Actions ด้วยคีย์ลับ (`server-only`)

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres RLS + Auth admin API), vitest

**Spec:** `docs/superpowers/specs/2026-11-26-user-roles-design.md`

## Global Constraints

- บทบาท: `admin`, `planner`, `readiness` · ป้าย: ผู้ดูแลระบบ / จัดรถ-ประสานงาน / ตรวจความพร้อม
- อีเมลภายใน: `<username>@users.ttn.internal` (ค่าคงที่ที่เดียว `INTERNAL_EMAIL_DOMAIN`)
- ชื่อผู้ใช้: `^[a-z0-9._-]{2,32}$` (แปลงเป็นตัวเล็กและ trim ก่อนตรวจ)
- `SUPABASE_SECRET_KEY` ห้ามมี `NEXT_PUBLIC_` และใช้ได้เฉพาะไฟล์ที่ `import "server-only"`
- ทุก Server Action ตรวจว่าผู้เรียกเป็น admin ที่ active จาก session ฝั่ง server ก่อนทำอะไร
- ข้อความบนหน้าจอเป็นภาษาไทย ใช้สไตล์จาก `src/components/ui/styles.ts`
- โหมดสาธิต (`NEXT_PUBLIC_DEMO=1`) = admin ไม่ต้องล็อกอิน

## Review Focus

1. admin ลดบทบาท / ปิดบัญชีตัวเอง หรือทำให้ไม่เหลือ admin ที่ active → ต้องถูกปฏิเสธพร้อมข้อความ (test ใน Task 1 `guardAdminChange`)
2. ชื่อผู้ใช้ซ้ำ / ตัวพิมพ์ใหญ่ / มีช่องว่าง → แปลงเป็นตัวเล็ก, ซ้ำแจ้ง "ชื่อผู้ใช้นี้มีแล้ว" (test ใน Task 1 + ตรวจใน Task 6)
3. readiness เรียก API เขียน `jobs` ตรง ๆ (ไม่ผ่านหน้าจอ) → RLS ปฏิเสธ (Task 2 `check-rls`)
4. บัญชีถูกปิดระหว่างที่ยังเปิดหน้าอยู่ → โหลดข้อมูลไม่ได้ / เห็นหน้า "ยังไม่ได้รับสิทธิ์" ตอนรีเฟรช (Task 2 `check-rls` ครอบ inactive)
5. ล็อกอินด้วยอีเมล Gmail เดิมหลัง migration → เข้าได้เป็น admin (Task 3 test `loginIdToEmail` + ตรวจจริงใน Task 7)

---

### Task 1: กฎบทบาทและชื่อผู้ใช้ (logic ล้วน)

**Files:**
- Create: `src/lib/auth/roles.ts`
- Test: `src/lib/auth/roles.test.ts`

**Interfaces:**
- Produces:
  - `type Role = "admin" | "planner" | "readiness"`
  - `const ROLES: Role[]`, `const ROLE_LABEL: Record<Role, string>`
  - `type Action = "plan.edit" | "driver.add" | "driver.edit" | "leave.edit" | "rates.edit" | "lookups.edit" | "users.manage"`
  - `can(role: Role | null, action: Action): boolean`
  - `const INTERNAL_EMAIL_DOMAIN = "users.ttn.internal"`
  - `normalizeUsername(s: string): string` · `isValidUsername(s: string): boolean`
  - `usernameToEmail(u: string): string` · `loginIdToEmail(id: string): string` (มี `@` → trim+lowercase คืนตามนั้น)
  - `interface ProfileLite { id: string; role: Role; active: boolean }`
  - `guardAdminChange(all: ProfileLite[], actorId: string, targetId: string, next: { role?: Role; active?: boolean }): string | null` — คืนข้อความ error หรือ null

- [ ] **Step 1: เขียน test**
  - `can("readiness","plan.edit")===false`, `can("readiness","leave.edit")===true`, `can("readiness","driver.edit")===true`, `can("planner","rates.edit")===true`, `can("planner","lookups.edit")===false`, `can("planner","users.manage")===false`, `can("admin", ทุก action)===true`, `can(null, ทุก action)===false`
  - `normalizeUsername("  AON ")==="aon"`; `isValidUsername("aon")`, `!isValidUsername("a")`, `!isValidUsername("ao n")`, `!isValidUsername("อร")`
  - `usernameToEmail("AON")==="aon@users.ttn.internal"`; `loginIdToEmail("satang")==="satang@users.ttn.internal"`; `loginIdToEmail(" Me@Gmail.com ")==="me@gmail.com"`
  - `guardAdminChange`: ตัวเองเปลี่ยน role → `"เปลี่ยนบทบาทของตัวเองไม่ได้"`; ตัวเองปิดบัญชี → `"ปิดบัญชีของตัวเองไม่ได้"`; ลด admin active คนสุดท้าย (เป้าหมายไม่ใช่ตัวเอง) → `"ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน"`; เปลี่ยน planner→readiness → null
- [ ] **Step 2:** `npx vitest run src/lib/auth` → FAIL (module not found)
- [ ] **Step 3:** เขียน `roles.ts` — สิทธิ์เป็นตาราง `Record<Action, Role[]>` ตามตารางใน spec
- [ ] **Step 4:** `npx vitest run src/lib/auth` → PASS
- [ ] **Step 5:** commit `เพิ่มกฎบทบาทและชื่อผู้ใช้`

### Task 2: Migration + ทดสอบ RLS จริง

**Files:**
- Create: `supabase/migrations/20261126000000_user_roles.sql`
- Create: `scripts/check-rls.ts` (+ `"check-rls"` ใน package.json แบบเดียวกับ import-*)

**Interfaces:**
- Produces: ตาราง `public.profiles(id uuid pk → auth.users on delete cascade, username text unique not null, display_name text not null, role text not null check, active boolean not null default true, created_at timestamptz default now())`; ฟังก์ชัน `public.my_role() returns text` (security definer, stable, `set search_path = public`)

- [ ] **Step 1: เขียน migration**
  - สร้างตาราง + `my_role()` + grant select profiles ให้ `authenticated`, ทั้งหมดให้ `service_role`
  - `drop policy "staff full access"` ทั้ง 6 ตาราง แล้วสร้างใหม่ตาม spec (select: `my_role() is not null`; เขียนตามตารางสิทธิ์)
  - `insert into profiles` ทุกแถวใน `auth.users` ที่ยังไม่มี: username = ส่วนหน้า @ (ตัวเล็ก), display_name = เหมือนกัน, role = `admin`
  - ทั้งไฟล์รันซ้ำได้ (`if not exists` / `drop policy if exists` / `on conflict do nothing`)
- [ ] **Step 2: เขียน `scripts/check-rls.ts`** — ใช้คีย์ลับสร้างผู้ใช้ทดสอบ `rls-admin`, `rls-planner`, `rls-readiness`, `rls-off` (active=false) พร้อม profile; ล็อกอินแต่ละคนด้วย publishable key แล้วลอง: select jobs, update `jobs.note` ของแถวที่มีอยู่ (คืนค่าเดิม), insert+delete `driver_unavailability`, update `lookups.sort` (คืนค่าเดิม); พิมพ์ตาราง ได้/ไม่ได้ เทียบกับที่คาด, exit 1 ถ้าไม่ตรง; ลบผู้ใช้ทดสอบใน `finally`
  - ค่าที่คาด: admin ✓✓✓✓ · planner ✓✓✓✗ · readiness ✓✗✓✗ · off ✗✗✗✗ (ลำดับ select jobs / update jobs / leave / lookups; "ไม่ได้" ของ update = 0 แถวถูกแก้หรือ error)
- [ ] **Step 3:** ผู้ใช้รัน migration ใน Supabase SQL Editor (เครื่องนี้ไม่มี psql/DB URL)
- [ ] **Step 4:** `npm run check-rls` → ทุกแถวตรงที่คาด, exit 0
- [ ] **Step 5:** commit `migration บทบาทผู้ใช้ + สคริปต์ตรวจ RLS`

### Task 3: ฝั่ง server — ผู้ใช้ปัจจุบัน + client คีย์ลับ + ล็อกอินด้วยชื่อผู้ใช้

**Files:**
- Create: `src/lib/supabase/admin.ts`, `src/lib/auth/session.ts`
- Modify: `src/app/login/LoginForm.tsx`, `package.json` (`npm i server-only`)

**Interfaces:**
- Consumes: Task 1 `Role`, `loginIdToEmail`
- Produces:
  - `supabaseAdmin(): SupabaseClient` (`import "server-only"`, throw ภาษาไทยถ้าไม่มี `SUPABASE_SECRET_KEY`)
  - `interface CurrentUser { id: string; username: string; displayName: string; role: Role | null; active: boolean }`
  - `getCurrentUser(): Promise<CurrentUser | null>` (`server-only`; null = ไม่ได้ล็อกอิน; ไม่มี profile → `role: null, active: false`; DEMO → admin `demo`)
  - `requireAdmin(): Promise<CurrentUser>` — throw `"ต้องเป็นผู้ดูแลระบบ"` ถ้าไม่ใช่ admin ที่ active

- [ ] **Step 1:** เขียน 3 ไฟล์ (profile อ่านด้วย client ของผู้ใช้เอง `supabaseServer()` ไม่ใช่คีย์ลับ)
- [ ] **Step 2:** LoginForm: ช่อง "ชื่อผู้ใช้หรืออีเมล" (`type="text"`, `autoComplete="username"`), ส่ง `loginIdToEmail(id)`, error "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", ลบข้อความ "สร้างบัญชีให้ใน Supabase"
- [ ] **Step 3:** `npx tsc --noEmit -p . && npm run lint` → ไม่มี error
- [ ] **Step 4:** commit `ล็อกอินด้วยชื่อผู้ใช้ + อ่านบทบาทฝั่ง server`

### Task 4: หน้าหลักรู้จักผู้ใช้ — เมนูบัญชี, หน้าไม่มีสิทธิ์, เปลี่ยนรหัสผ่าน

**Files:**
- Modify: `src/app/page.tsx`, `src/components/board/PlanBoard.tsx`, `src/components/board/Header.tsx`
- Create: `src/components/board/AccountDialogs.tsx` (`ChangePasswordDialog`), `src/components/NoAccess.tsx`

**Interfaces:**
- Consumes: Task 3 `getCurrentUser`, `CurrentUser`; Task 1 `ROLE_LABEL`, `can`
- Produces: `PlanBoard(props: { initialDate: string; user: CurrentUser })` (แทน `userEmail`); `Header` รับ `user: CurrentUser` + `onChangePassword: () => void`

- [ ] **Step 1:** `page.tsx`: `getCurrentUser()`; `!user.active || !user.role` → `<NoAccess />` (ข้อความ "บัญชียังไม่ได้รับสิทธิ์ ติดต่อผู้ดูแลระบบ" + ปุ่มออกจากระบบ)
- [ ] **Step 2:** Header: วงกลมแสดงอักษรแรกของ displayName; เมนูแสดง displayName + ROLE_LABEL; ลิงก์ `/users` เมื่อ `can(role,"users.manage")`; ปุ่ม "เปลี่ยนรหัสผ่าน"; ออกจากระบบ
- [ ] **Step 3:** ChangePasswordDialog: รหัสใหม่ + ยืนยัน, ขั้นต่ำ 8 ตัว, ไม่ตรงกัน → "รหัสผ่านไม่ตรงกัน", เรียก `supabaseBrowser().auth.updateUser({ password })`, toast สำเร็จ
- [ ] **Step 4:** `npx tsc --noEmit -p . && npm run lint && npm test` → ผ่าน; `npm run demo` เปิดได้ เมนูแสดง "demo · ผู้ดูแลระบบ"
- [ ] **Step 5:** commit `แสดงผู้ใช้/บทบาทที่หัวหน้าจอ + เปลี่ยนรหัสผ่าน`

### Task 5: ซ่อนปุ่มตามบทบาท

**Files:**
- Modify: `src/components/board/PlanBoard.tsx`, `JobList.tsx`, `JobDialog.tsx`, `DriverBrowser.tsx` (ถ้าจำเป็น)

**Interfaces:**
- Consumes: Task 1 `can`; Task 4 `user` ใน PlanBoard
- Produces: `JobList` prop `readOnly: boolean`; `JobDialog` prop `readOnly: boolean`

- [ ] **Step 1:** PlanBoard คำนวณ `canPlan = can(role,"plan.edit")`, `canAddDriver = can(role,"driver.add")`; เมื่อ `!canPlan`: ไม่ส่ง `onPick` ให้ DriverBrowser แผงขวา, ซ่อนปุ่ม "นำเข้าแพลน" ใน Header, ไม่เปิด ImportDialog; `!canAddDriver` → ซ่อน "เพิ่มคนขับ" ทั้ง 2 ที่; `onLeave` คงไว้
- [ ] **Step 2:** JobList `readOnly`: ซ่อนจัดรถอัตโนมัติ, นำเข้า, ล้างคนขับ, ปุ่มสถานะ/เลือกคนขับ/ช่องราคาในแถว, checkbox เลือกหลายแถวที่ใช้เพื่อแก้; คลิกแถวยังเปิด JobDialog ได้; ปุ่มข้อความ LINE ยังอยู่
- [ ] **Step 3:** JobDialog `readOnly`: ทุกช่อง `disabled`, ซ่อนบันทึก/ลบ/เลือกคนขับ, ปุ่มเหลือ "ปิด"
- [ ] **Step 4:** ตรวจในโหมดสาธิตชั่วคราวด้วยการสลับ role demo เป็น readiness (ไม่ commit การสลับ) → ไม่เห็นปุ่มที่ห้าม แจ้งวันไม่ว่างได้; `npx tsc --noEmit -p . && npm run lint && npm test` ผ่าน
- [ ] **Step 5:** commit `ซ่อนปุ่มแก้แพลนสำหรับบทบาทตรวจความพร้อม`

### Task 6: หน้าจัดการผู้ใช้ `/users`

**Files:**
- Create: `src/app/users/page.tsx`, `src/app/users/actions.ts` (`"use server"`), `src/app/users/UsersTable.tsx` (client)

**Interfaces:**
- Consumes: Task 3 `requireAdmin`, `supabaseAdmin`, `getCurrentUser`; Task 1 `normalizeUsername`, `isValidUsername`, `usernameToEmail`, `guardAdminChange`, `ROLES`, `ROLE_LABEL`
- Produces (ทุกตัวคืน `Promise<{ ok: true } | { ok: false; error: string }>`):
  - `createUser(input: { username: string; displayName: string; role: Role; password: string })`
  - `setRole(id: string, role: Role)` · `setActive(id: string, active: boolean)` · `resetPassword(id: string, password: string)`

- [ ] **Step 1:** actions: ทุกตัวเรียก `requireAdmin()` ก่อน; ตรวจ input ด้วย Task 1 (รหัสผ่าน ≥ 8 ตัว); `createUser` = `auth.admin.createUser({ email: usernameToEmail, password, email_confirm: true })` แล้ว insert profile (ถ้า insert ล้มให้ลบ auth user ทิ้ง); username ซ้ำ → `"ชื่อผู้ใช้นี้มีแล้ว"`; `setRole`/`setActive` ผ่าน `guardAdminChange` ก่อน; `setActive(false)` = profile.active=false + `updateUserById(id, { ban_duration: "876000h" })`, เปิด = `"none"`; จบด้วย `revalidatePath("/users")`
- [ ] **Step 2:** page.tsx: ไม่ใช่ admin → `redirect("/")`; โหลด profiles (คีย์ลับ) + `auth.admin.listUsers()` เพื่อ `last_sign_in_at`; ส่งให้ UsersTable
- [ ] **Step 3:** UsersTable: ตาราง ชื่อผู้ใช้ · ชื่อที่แสดง · บทบาท (select) · สถานะ (ปุ่มปิด/เปิด) · เข้าระบบล่าสุด · ปุ่มตั้งรหัสผ่านใหม่; ฟอร์มเพิ่มผู้ใช้; แสดง error จาก action; ลิงก์กลับหน้าแพลน; แถวของตัวเองปิดการเปลี่ยนบทบาท/สถานะ
- [ ] **Step 4:** `npx tsc --noEmit -p . && npm run lint && npm run build` ผ่าน; `npm run dev` ล็อกอิน admin → สร้างผู้ใช้ทดสอบ → เปลี่ยนบทบาท → ปิด → ลบทิ้งด้วยสคริปต์/ dashboard
- [ ] **Step 5:** commit `หน้าจัดการผู้ใช้สำหรับผู้ดูแลระบบ`

### Task 7: เอกสาร + deploy

**Files:**
- Modify: `README.md` (ขั้นติดตั้ง: migration, `SUPABASE_SECRET_KEY` ใน Vercel ฝั่ง server, สร้างผู้ใช้ที่ `/users`, ตารางบทบาท), `.env.example` (คอมเมนต์ SUPABASE_SECRET_KEY)

- [ ] **Step 1:** แก้ README / .env.example
- [ ] **Step 2:** `npm test && npm run lint && npm run build` ผ่าน
- [ ] **Step 3:** ผู้ใช้ตั้ง `SUPABASE_SECRET_KEY` ใน Vercel → Settings → Environment Variables (Production)
- [ ] **Step 4:** merge `import-worklog-excel` + `user-roles` เข้า `main` แล้ว `git push origin main` (Vercel deploy อัตโนมัติจาก GitHub)
- [ ] **Step 5:** ตรวจบนเว็บจริง: ล็อกอิน Gmail เดิมได้เป็น admin → `/users` สร้าง `aon` (planner) และ `satang` (readiness) → ล็อกอิน `satang` ไม่เห็นปุ่มนำเข้าแพลน
