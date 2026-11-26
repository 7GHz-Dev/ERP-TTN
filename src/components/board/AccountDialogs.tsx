"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { button, input, label } from "@/components/ui/styles";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DEMO } from "@/lib/demo";
import { authErrorText, passwordError } from "@/lib/auth/roles";

/** เปลี่ยนรหัสผ่านของตัวเอง (ไม่ต้องใช้คีย์ลับ) */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const bad = passwordError(pw);
    if (bad) return setError(bad);
    if (pw !== pw2) return setError("รหัสผ่านไม่ตรงกัน");
    setBusy(true);
    setError(null);
    const { error } = DEMO ? { error: null } : await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(authErrorText(error.message));
    toast({ message: "เปลี่ยนรหัสผ่านแล้ว" });
    setPw("");
    setPw2("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="เปลี่ยนรหัสผ่าน"
      footer={
        <>
          <button type="button" className={button("secondary")} onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" form="change-password" disabled={busy} className={button("primary")}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            บันทึก
          </button>
        </>
      }
    >
      <form id="change-password" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className={label}>
            รหัสผ่านใหม่
          </label>
          <input id="new-password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="new-password-2" className={label}>
            ยืนยันรหัสผ่านใหม่
          </label>
          <input id="new-password-2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} />
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
