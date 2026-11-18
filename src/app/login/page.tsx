import { LoginForm } from "./LoginForm";

export const metadata = { title: "เข้าสู่ระบบ · TTN แพลนลากตู้" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-blue-900 text-lg font-bold text-white">T</div>
          <div>
            <p className="text-lg font-semibold leading-tight">TTN แพลนลากตู้</p>
            <p className="text-sm text-slate-500">จัดรถ จัดคนขับ และรถร่วม</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
