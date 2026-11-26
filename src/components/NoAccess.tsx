"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { button } from "@/components/ui/styles";
import { supabaseBrowser } from "@/lib/supabase/client";

/** ล็อกอินได้แต่ไม่มีบทบาท หรือบัญชีถูกปิด */
export function NoAccess({ username }: { username: string }) {
  const router = useRouter();
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="text-lg font-semibold">บัญชียังไม่ได้รับสิทธิ์</h1>
        <p className="text-sm text-slate-600">
          บัญชี <span className="font-medium">{username}</span> ยังไม่มีบทบาท หรือถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ
        </p>
        <button
          type="button"
          className={button("secondary", "md")}
          onClick={async () => {
            await supabaseBrowser().auth.signOut();
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut className="size-4" aria-hidden />
          ออกจากระบบ
        </button>
      </div>
    </main>
  );
}
