"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Loader2, UserPlus } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@/components/ui/Modal";
import { button, input, label } from "@/components/ui/styles";
import { MIN_PASSWORD, ROLES, ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { createUser, resetPassword, setActive, setRole, type Result } from "./actions";

export interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  lastSignIn: string | null;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }) : "ยังไม่เคย";

export function UsersTable({ rows, meId, loadError }: { rows: UserRow[]; meId: string; loadError: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(loadError);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);

  const act = (fn: () => Promise<Result>, ok: string) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await fn();
      if (r.ok) setNotice(ok);
      else setError(r.error);
    });

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className={button("ghost", "md")}>
          <ArrowLeft className="size-4" aria-hidden />
          หน้าแพลน
        </Link>
        <h1 className="text-lg font-semibold">จัดการผู้ใช้</h1>
        {pending && <Loader2 className="size-4 animate-spin text-slate-500" aria-label="กำลังบันทึก" />}
        <button type="button" className={button("primary", "md", "ml-auto")} onClick={() => setAdding(true)}>
          <UserPlus className="size-4" aria-hidden />
          เพิ่มผู้ใช้
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
              <th className="px-3 py-2">ชื่อผู้ใช้</th>
              <th className="px-3 py-2">ชื่อที่แสดง</th>
              <th className="px-3 py-2">บทบาท</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2">เข้าระบบล่าสุด</th>
              <th className="px-3 py-2">
                <span className="sr-only">รหัสผ่าน</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const me = u.id === meId;
              return (
                <tr key={u.id} className={clsx("border-b border-slate-100", !u.active && "text-slate-400")}>
                  <td className="px-3 py-2 font-mono">
                    {u.username}
                    {me && <span className="ml-1.5 font-sans text-xs text-slate-500">(คุณ)</span>}
                  </td>
                  <td className="px-3 py-2">{u.displayName}</td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`บทบาทของ ${u.username}`}
                      value={u.role}
                      disabled={me || pending}
                      onChange={(e) => act(() => setRole(u.id, e.target.value as Role), `เปลี่ยนบทบาท ${u.username} แล้ว`)}
                      className={clsx(input, "h-9 py-1")}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={me || pending}
                      onClick={() => act(() => setActive(u.id, !u.active), `${u.active ? "ปิด" : "เปิด"}บัญชี ${u.username} แล้ว`)}
                      className={button(u.active ? "secondary" : "primary", "sm")}
                    >
                      {u.active ? "ใช้งานอยู่ · ปิด" : "ปิดอยู่ · เปิด"}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmt(u.lastSignIn)}</td>
                  <td className="px-3 py-2">
                    <button type="button" disabled={pending} onClick={() => setResetFor(u)} className={button("ghost", "sm")}>
                      <KeyRound className="size-4" aria-hidden />
                      ตั้งรหัสใหม่
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddUserDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSubmit={async (v) => {
          const r = await createUser(v);
          if (r.ok) setNotice(`เพิ่มผู้ใช้ ${v.username.trim().toLowerCase()} แล้ว`);
          return r;
        }}
      />
      <ResetPasswordDialog
        user={resetFor}
        onClose={() => setResetFor(null)}
        onSubmit={async (pw) => {
          const r = await resetPassword(resetFor!.id, pw);
          if (r.ok) setNotice(`ตั้งรหัสผ่านใหม่ให้ ${resetFor!.username} แล้ว`);
          return r;
        }}
      />
    </main>
  );
}

function Footer({ onClose, form, busy }: { onClose: () => void; form: string; busy: boolean }) {
  return (
    <>
      <button type="button" className={button("secondary")} onClick={onClose}>
        ยกเลิก
      </button>
      <button type="submit" form={form} disabled={busy} className={button("primary")}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        บันทึก
      </button>
    </>
  );
}

function AddUserDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { username: string; displayName: string; role: Role; password: string }) => Promise<Result>;
}) {
  const [v, setV] = useState({ username: "", displayName: "", role: "planner" as Role, password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await onSubmit(v);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setV({ username: "", displayName: "", role: "planner", password: "" });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title="เพิ่มผู้ใช้" footer={<Footer onClose={onClose} form="add-user" busy={busy} />}>
      <form id="add-user" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="au-username" className={label}>
            ชื่อผู้ใช้ (ใช้ล็อกอิน)
          </label>
          <input
            id="au-username"
            required
            autoCapitalize="none"
            spellCheck={false}
            placeholder="เช่น aon"
            value={v.username}
            onChange={(e) => setV({ ...v, username: e.target.value })}
            className={clsx(input, "font-mono")}
          />
          <p className="mt-1 text-xs text-slate-500">a-z 0-9 . _ - ยาว 2–32 ตัว</p>
        </div>
        <div>
          <label htmlFor="au-display" className={label}>
            ชื่อที่แสดง
          </label>
          <input id="au-display" placeholder="เช่น AON" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} className={input} />
        </div>
        <div>
          <label htmlFor="au-role" className={label}>
            บทบาท
          </label>
          <select id="au-role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })} className={input}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="au-password" className={label}>
            รหัสผ่านเริ่มต้น
          </label>
          <input
            id="au-password"
            type="text"
            required
            minLength={MIN_PASSWORD}
            autoComplete="off"
            value={v.password}
            onChange={(e) => setV({ ...v, password: e.target.value })}
            className={clsx(input, "font-mono")}
          />
          <p className="mt-1 text-xs text-slate-500">อย่างน้อย {MIN_PASSWORD} ตัว · แจ้งผู้ใช้ให้เปลี่ยนเองหลังล็อกอิน</p>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onSubmit,
}: {
  user: UserRow | null;
  onClose: () => void;
  onSubmit: (password: string) => Promise<Result>;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setPw("");
    setError(null);
    onClose();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await onSubmit(pw);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    close();
  }

  return (
    <Modal
      open={!!user}
      onClose={close}
      size="sm"
      title={`ตั้งรหัสผ่านใหม่ · ${user?.username ?? ""}`}
      footer={<Footer onClose={close} form="reset-password" busy={busy} />}
    >
      <form id="reset-password" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="rp-password" className={label}>
            รหัสผ่านใหม่
          </label>
          <input
            id="rp-password"
            type="text"
            required
            minLength={MIN_PASSWORD}
            autoComplete="off"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className={clsx(input, "font-mono")}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
