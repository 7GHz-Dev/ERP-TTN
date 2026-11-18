import { PlanBoard } from "@/components/board/PlanBoard";
import { isISODate, todayBangkok } from "@/lib/logic/dates";
import { supabaseServer } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo";

export default async function Home({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const initialDate = isISODate(d) ? d : todayBangkok();
  if (DEMO) return <PlanBoard initialDate={initialDate} userEmail="demo@example.com" />;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? "";
  return <PlanBoard initialDate={initialDate} userEmail={email} />;
}
