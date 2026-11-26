import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { button } from "@/components/ui/styles";
import { SETTINGS_TAB_LABEL, type SettingsTab } from "@/lib/auth/roles";

export function SettingsShell({ tabs, active, children }: { tabs: SettingsTab[]; active: SettingsTab; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/" className={button("ghost", "md")}>
          <ArrowLeft className="size-4" aria-hidden />
          หน้าแพลน
        </Link>
        <h1 className="text-lg font-semibold">ตั้งค่า</h1>
      </div>
      <nav aria-label="หมวดตั้งค่า" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/settings?tab=${t}`}
            aria-current={t === active ? "page" : undefined}
            className={clsx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              t === active ? "border-blue-800 text-blue-900" : "border-transparent text-slate-600 hover:text-slate-900",
            )}
          >
            {SETTINGS_TAB_LABEL[t]}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
