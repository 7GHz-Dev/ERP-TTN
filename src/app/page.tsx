import { PlanBoard } from "@/components/board/PlanBoard";
import { isISODate, todayBangkok } from "@/lib/logic/dates";
import { supabaseServer } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export default async function Home({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const initialDate = isISODate(d) ? d : todayBangkok();
  if (DEMO) return <PlanBoard initialDate={initialDate} userEmail="demo@example.com" />;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold">ยังไม่ได้เชื่อมต่อฐานข้อมูล</h1>
          <p className="text-sm text-slate-600">
            ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ใน Vercel → Settings → Environment Variables แล้ว deploy ใหม่
          </p>
        </div>
      </main>
    );
  }
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? "";
  return <PlanBoard initialDate={initialDate} userEmail={email} />;
}
