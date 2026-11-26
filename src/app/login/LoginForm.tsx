"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { button, input, label } from "@/components/ui/styles";
import { DEMO } from "@/lib/demo";
import { signIn } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = DEMO ? ({ ok: true } as const) : await signIn(loginId, password);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div>
        <label htmlFor="login-id" className={label}>
          ชื่อผู้ใช้
        </label>
        <input
          id="login-id"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="password" className={label}>
          รหัสผ่าน
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={button("primary", "lg", "w-full")}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        เข้าสู่ระบบ
      </button>
      <p className="text-center text-xs text-slate-500">ใช้ชื่อผู้ใช้หรืออีเมล · ลืมรหัสผ่านติดต่อผู้ดูแลระบบ</p>
    </form>
  );
}
