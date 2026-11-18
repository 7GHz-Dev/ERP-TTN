"use client";

import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

type Tone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

type ToastFn = (t: Omit<ToastItem, "id" | "tone"> & { tone?: Tone; duration?: number }) => void;

const Ctx = createContext<ToastFn>(() => {});

export function useToast() {
  return useContext(Ctx);
}

const ICON = { success: CheckCircle2, error: AlertTriangle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const toast = useCallback<ToastFn>(
    ({ duration, tone = "success", ...t }) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { id, tone, ...t }]);
      window.setTimeout(() => dismiss(id), duration ?? (tone === "error" ? 8000 : 5000));
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end"
      >
        {items.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={clsx(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1",
                t.tone === "error" ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-slate-900 text-white ring-slate-900",
              )}
            >
              <Icon className={clsx("mt-0.5 size-4 shrink-0", t.tone === "success" && "text-emerald-400")} aria-hidden />
              <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  className="shrink-0 font-semibold text-amber-300 hover:text-amber-200"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" aria-label="ปิดข้อความ" className="shrink-0 opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)}>
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
